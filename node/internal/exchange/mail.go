package exchange

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// Reaching somebody who is not looking at the page.
//
// An operator signed in, set what they would take, and found an empty board.
// There was no way to tell them work had appeared — the only push mechanism
// was a dispatch webhook, which needs an HTTPS endpoint and is a fleet's tool,
// not a person's. So somebody with a phone could only keep refreshing.
//
// They check twice and never come back, and because nothing could reach them
// their signup was worthless the moment the tab closed. Acquiring supply and
// then discarding it is the specific way a marketplace fails at the start,
// when there is not enough work to hold anybody's attention on its own.

// Mailer sends a plain message. Narrow on purpose: nothing here should be able
// to send anything but notifications about somebody's own work.
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// SES sends through Amazon SES, signed by hand for the same reason everything
// else here is: the container has no shell and no CLI.
type SES struct {
	Region string
	From   string
	Creds  *vision.CredentialSource
	HTTP   *http.Client
	Now    func() time.Time
}

// NewSES builds the sender from the environment, or returns nil when it is not
// configured — which is a development setup, not an error.
func NewSES() *SES {
	region := os.Getenv("AWS_REGION")
	from := os.Getenv("LAMDIS_MAIL_FROM")
	if region == "" || from == "" {
		return nil
	}
	return &SES{
		Region: region, From: from,
		Creds: &vision.CredentialSource{},
		HTTP:  &http.Client{Timeout: 15 * time.Second},
		Now:   time.Now,
	}
}

func (s *SES) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Send delivers one message.
func (s *SES) Send(ctx context.Context, to, subject, body string) error {
	if s == nil {
		return fmt.Errorf("mail: not configured")
	}
	creds, err := s.Creds.Get(ctx)
	if err != nil {
		return fmt.Errorf("mail: no credentials: %w", err)
	}
	form := url.Values{}
	form.Set("Action", "SendEmail")
	form.Set("Version", "2010-12-01")
	form.Set("Source", s.From)
	form.Set("Destination.ToAddresses.member.1", to)
	form.Set("Message.Subject.Data", subject)
	form.Set("Message.Body.Text.Data", body)
	payload := []byte(form.Encode())

	endpoint := "https://email." + s.Region + ".amazonaws.com/"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		strings.NewReader(string(payload)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	vision.SignV4(req, payload, creds, s.Region, "ses", s.now())

	resp, err := s.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("mail: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("mail: ses returned %d", resp.StatusCode)
	}
	return nil
}
