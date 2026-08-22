package api

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Sign-in, by email and a six-digit code.
//
// There is no guest tier and no password. A guest could not be paid, and work
// nobody can be paid for is work nobody has a reason to do — the tier existed
// because it was easy, not because anyone wanted it. Requiring an account
// before taking work also closes the hole underneath every abuse rule: seats,
// conflicts and limits all key on identity, and an identity anyone can mint
// for free bounds nothing.
//
// Passwords are absent for the same reason they were never needed: the thing
// being established is control of an address, and a code sent to that address
// establishes it directly. A password would be one more credential to steal,
// reset and phish for no additional assurance.
//
// Cognito's own endpoints do this without SigV4 as long as the client has no
// secret, so this is plain HTTPS and the exchange keeps its short dependency
// list.
type Auth struct {
	Region   string
	PoolID   string
	ClientID string
	HTTP     *http.Client
	Now      func() time.Time

	mu      sync.Mutex
	pending map[string]*pendingSignIn
	Workers *Workers
}

// pendingSignIn is what the exchange remembers between the two halves of a
// sign-in. It is deliberately short-lived and in memory: it holds a password
// nobody will ever use again, and persisting that would be worse than losing it.
type pendingSignIn struct {
	Email    string
	Session  string
	Stage    string // "otp" for a returning person, "confirm" for a new one
	Password string
	Expires  time.Time
}

func NewAuth(region, poolID, clientID string, workers *Workers) *Auth {
	return &Auth{
		Region: region, PoolID: poolID, ClientID: clientID,
		HTTP: &http.Client{Timeout: 15 * time.Second}, Now: time.Now,
		pending: map[string]*pendingSignIn{}, Workers: workers,
	}
}

func (a *Auth) Enabled() bool { return a != nil && a.ClientID != "" && a.Region != "" }

func (a *Auth) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func (a *Auth) endpoint() string {
	return fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/", a.Region)
}

// call posts one Cognito API action.
func (a *Auth) call(target string, in any) (map[string]any, error) {
	body, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, a.endpoint(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-amz-json-1.1")
	req.Header.Set("X-Amz-Target", "AWSCognitoIdentityProviderService."+target)
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		kind, _ := out["__type"].(string)
		msg, _ := out["message"].(string)
		return out, &cognitoError{Kind: kind, Message: msg, Status: resp.StatusCode}
	}
	return out, nil
}

type cognitoError struct {
	Kind    string
	Message string
	Status  int
}

func (e *cognitoError) Error() string { return e.Kind + ": " + e.Message }

func (e *cognitoError) is(kind string) bool { return strings.Contains(e.Kind, kind) }

func (a *Auth) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /signin", a.handlePage)
	mux.HandleFunc("POST /v1/auth/start", a.handleStart)
	mux.HandleFunc("POST /v1/auth/verify", a.handleVerify)
}

func (a *Auth) handlePage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Referrer-Policy", "no-referrer")
	fmt.Fprint(w, signInPageHTML)
}

// randomPassword is used exactly once, to complete a first sign-in, and then
// forgotten. Cognito requires a password to create an account; nothing
// requires the person to ever know it.
func randomPassword() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	// Mixed case, digits and a symbol, so it satisfies any policy.
	return "Aa1!" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func ticket() (string, error) {
	raw := make([]byte, 18)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return secretAlphabet.EncodeToString(raw), nil
}

type startRequest struct {
	Email string `json:"email"`
}

// handleStart sends one code, whether or not the person has been here before.
//
// A returning person gets an EMAIL_OTP challenge. A new one is registered and
// gets a confirmation code. Both are a single six-digit code in a single
// email, because a first-time flow that sends two is a flow people abandon.
func (a *Auth) handleStart(w http.ResponseWriter, r *http.Request) {
	if !a.Enabled() {
		writeWork(w, http.StatusServiceUnavailable,
			map[string]string{"error": "sign-in is not configured on this exchange"})
		return
	}
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	var in startRequest
	if err := json.Unmarshal(body, &in); err != nil {
		writeWork(w, http.StatusBadRequest, map[string]string{"error": "malformed request"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(in.Email))
	if !strings.Contains(email, "@") || len(email) < 5 {
		writeWork(w, http.StatusBadRequest,
			map[string]string{"error": "that does not look like an email address"})
		return
	}

	tk, err := ticket()
	if err != nil {
		refuse(w)
		return
	}
	p := &pendingSignIn{Email: email, Expires: a.now().Add(15 * time.Minute)}

	// Sign up first, and use the answer to tell new from returning.
	//
	// The obvious order — try to sign in, fall back to registering — cannot
	// work here. The pool has PreventUserExistenceErrors on, which is right:
	// it stops anyone probing which addresses have accounts. But it means
	// InitiateAuth returns a *simulated* challenge for an unknown address
	// rather than an error, so a sign-in attempt looks identical whether or
	// not the person exists. Reading that as success sent nobody an email and
	// told them we had.
	//
	// SignUp is unambiguous: it either creates the account or says the name is
	// taken, and that distinction is not something an attacker can reach,
	// because this endpoint answers the same either way.
	pw, err := randomPassword()
	if err != nil {
		refuse(w)
		return
	}
	_, signupErr := a.call("SignUp", map[string]any{
		"ClientId": a.ClientID, "Username": email, "Password": pw,
		"UserAttributes": []map[string]string{{"Name": "email", "Value": email}},
	})
	switch {
	case signupErr == nil:
		// New account. The confirmation code Cognito just emailed is the only
		// code they will need — a first visit costs one email, not two.
		p.Password, p.Stage = pw, "confirm"
	default:
		ce, ok := signupErr.(*cognitoError)
		if !ok || !ce.is("UsernameExists") {
			writeWork(w, http.StatusBadGateway,
				map[string]string{"error": "could not start sign-in just now"})
			return
		}
		// They already have an account, so send a sign-in code.
		out, err := a.call("InitiateAuth", map[string]any{
			"AuthFlow": "USER_AUTH", "ClientId": a.ClientID,
			"AuthParameters": map[string]string{
				"USERNAME": email, "PREFERRED_CHALLENGE": "EMAIL_OTP",
			},
		})
		if err != nil {
			writeWork(w, http.StatusBadGateway,
				map[string]string{"error": "could not start sign-in just now"})
			return
		}
		sess, _ := out["Session"].(string)
		if sess == "" {
			writeWork(w, http.StatusBadGateway,
				map[string]string{"error": "could not start sign-in just now"})
			return
		}
		p.Session, p.Stage = sess, "otp"
	}

	a.mu.Lock()
	a.pending[tk] = p
	a.sweepLocked()
	a.mu.Unlock()

	// The response says the same thing either way, so it cannot be used to
	// find out which addresses already have accounts.
	writeWork(w, http.StatusOK, map[string]any{
		"ticket": tk,
		"sent":   true,
		"note":   "we sent a six-digit code to that address",
	})
}

func (a *Auth) sweepLocked() {
	now := a.now()
	for k, v := range a.pending {
		if now.After(v.Expires) {
			delete(a.pending, k)
		}
	}
}

type verifyRequest struct {
	Ticket string `json:"ticket"`
	Code   string `json:"code"`
}

// handleVerify exchanges the code for tokens.
func (a *Auth) handleVerify(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	var in verifyRequest
	if err := json.Unmarshal(body, &in); err != nil {
		writeWork(w, http.StatusBadRequest, map[string]string{"error": "malformed request"})
		return
	}
	a.mu.Lock()
	p, ok := a.pending[in.Ticket]
	if ok && a.now().After(p.Expires) {
		delete(a.pending, in.Ticket)
		ok = false
	}
	a.mu.Unlock()
	code := strings.TrimSpace(in.Code)
	if !ok || code == "" {
		writeWork(w, http.StatusUnauthorized,
			map[string]string{"error": "that code has expired — start again"})
		return
	}

	var idToken string
	switch p.Stage {
	case "otp":
		out, err := a.call("RespondToAuthChallenge", map[string]any{
			"ClientId": a.ClientID, "ChallengeName": "EMAIL_OTP", "Session": p.Session,
			"ChallengeResponses": map[string]string{
				"USERNAME": p.Email, "EMAIL_OTP_CODE": code,
			},
		})
		if err != nil {
			writeWork(w, http.StatusUnauthorized,
				map[string]string{"error": "that code was not right"})
			return
		}
		idToken = authResultToken(out)
	case "confirm":
		if _, err := a.call("ConfirmSignUp", map[string]any{
			"ClientId": a.ClientID, "Username": p.Email, "ConfirmationCode": code,
		}); err != nil {
			writeWork(w, http.StatusUnauthorized,
				map[string]string{"error": "that code was not right"})
			return
		}
		// Confirmed. Sign them straight in with the password they will never
		// see, so a first visit costs one code rather than two.
		out, err := a.call("InitiateAuth", map[string]any{
			"AuthFlow": "USER_PASSWORD_AUTH", "ClientId": a.ClientID,
			"AuthParameters": map[string]string{"USERNAME": p.Email, "PASSWORD": p.Password},
		})
		if err != nil {
			writeWork(w, http.StatusBadGateway,
				map[string]string{"error": "your account was created; please sign in again"})
			return
		}
		idToken = authResultToken(out)
	}

	if idToken == "" {
		writeWork(w, http.StatusBadGateway,
			map[string]string{"error": "sign-in did not complete"})
		return
	}
	a.mu.Lock()
	delete(a.pending, in.Ticket)
	a.mu.Unlock()

	// Register the worker now, so the very first thing they see is their own
	// standing rather than an empty account.
	//
	// If the token cannot be resolved here it will not resolve on any later
	// request either, so this is a failed sign-in. Returning success with an
	// empty worker id used to hand the browser a session that looked valid and
	// was refused everywhere — signed in, and bounced to the sign-in page by
	// every button on the site.
	var workerID string
	if a.Workers != nil && a.Workers.Cognito.Enabled() {
		claims, verr := a.Workers.Cognito.Verify(idToken)
		if verr != nil {
			writeWork(w, http.StatusBadGateway, map[string]string{
				"error": "signed in, but this exchange could not verify the session; try again"})
			return
		}
		workerID = a.Workers.upsertVerified(claims).ID
	}
	writeWork(w, http.StatusOK, map[string]any{
		"id_token": idToken, "worker": workerID, "verified": true,
	})
}

func authResultToken(out map[string]any) string {
	res, ok := out["AuthenticationResult"].(map[string]any)
	if !ok {
		return ""
	}
	t, _ := res["IdToken"].(string)
	return t
}
