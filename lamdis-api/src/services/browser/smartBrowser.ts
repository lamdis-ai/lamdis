/**
 * SmartBrowser — LLM-guided browser automation with human-like behavior.
 *
 * Uses Playwright with persistent context, human timing/movement patterns,
 * and Claude to analyze DOM and decide actions.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { DOM_SIMPLIFIER_SCRIPT, formatDOMForLLM, type SimplifiedDOM } from './domSimplifier.js';
import * as timing from './humanTiming.js';
import { bedrockChatOnce } from '../../lib/bedrockChat.js';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const BROWSER_MODEL = process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';
const PROFILES_ROOT = process.env.BROWSER_PROFILES_ROOT || './data/browser-profiles';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min idle → close
const MFA_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min when MFA is pending

// ---------------------------------------------------------------------------
// Visual Triage — screenshot page and use LLM vision to identify matching images
// ---------------------------------------------------------------------------

async function triageImagesWithVision(
  screenshot: Buffer,
  description: string,
  meterContext: import('../llmCostControl/index.js').MeterContext,
): Promise<{ matches: number[]; reasoning: string }> {
  try {
    const base64 = screenshot.toString('base64');
    const response = await bedrockChatOnce({
      modelId: BROWSER_MODEL,
      meterContext: { ...meterContext, serviceKey: 'smartBrowser.visionTriage' },
      messages: [{
        role: 'user',
        content: `This is a screenshot of a Google Images search results page. I need to find images that show: "${description}"

Look at ALL the image thumbnails visible on the page. For each one, determine if it shows the described item.

Return ONLY a JSON object:
{
  "matches": [list of 0-based indices of matching images, counting left-to-right top-to-bottom across rows],
  "reasoning": "brief explanation of what you see in each matching image"
}

Be selective — only include images that clearly show the described item with the correct color, model, and type. Skip images that show different models, wrong colors, parts/accessories, or unrelated items.`,
        attachments: [{ data: base64, mimeType: 'image/png', name: 'search-results' }],
      }],
      system: 'You are a visual image triage assistant. Analyze screenshot grids of search results and identify which thumbnails match a product description. Respond ONLY with valid JSON.',
      maxTokens: 512,
      temperature: 0.1,
    });

    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    return {
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return { matches: [], reasoning: 'Triage failed — will use all images' };
  }
}

// ---------------------------------------------------------------------------
// Session management — reuse browser across tool calls
// ---------------------------------------------------------------------------

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  orgId: string;
}

const sessions = new Map<string, BrowserSession>();

/**
 * Get the active browser session for an org (for live browser view).
 * Returns the page object and current URL, or null if no session exists.
 */
export function getActiveBrowserSession(orgId: string): { page: Page; url: string } | null {
  const session = sessions.get(orgId);
  if (!session) return null;
  return { page: session.page, url: session.page.url() };
}

/**
 * Touch a session's lastUsed timestamp to keep the idle reaper from killing it.
 * Used while a user is actively watching the live browser view.
 */
export function touchBrowserSession(orgId: string): void {
  const s = sessions.get(orgId);
  if (s) s.lastUsed = Date.now();
}

// Cleanup idle sessions
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastUsed > IDLE_TIMEOUT_MS) {
      session.context.close().catch(() => {});
      session.browser.close().catch(() => {});
      sessions.delete(key);
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Core SmartBrowser
// ---------------------------------------------------------------------------

export interface BrowseResult {
  ok: boolean;
  url: string;
  title: string;
  actions: Array<{ action: string; selector?: string; result?: string; error?: string }>;
  extractedImages?: string[];
  extractedText?: string;
  pageState?: string;
  triageApplied?: boolean;
  screenshotUrl?: string;
  mfaChallenge?: { detected: boolean; challengeType: string; summary: string };
  error?: string;
}

export async function smartBrowse(opts: {
  url?: string;
  instruction: string;
  extractImages?: boolean;
  orgId: string;
  instanceId?: string;
}): Promise<BrowseResult> {
  const { url, instruction, extractImages, orgId } = opts;
  const sessionKey = orgId;

  let session = sessions.get(sessionKey);

  // Launch or reuse browser
  if (!session) {
    try {
      const { chromium } = require('playwright') as typeof import('playwright');

      const profileDir = join(PROFILES_ROOT, orgId);
      if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });

      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });

      const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation'],
      });

      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(30000);

      const page = await context.newPage();
      session = { browser, context, page, lastUsed: Date.now(), orgId };
      sessions.set(sessionKey, session);
    } catch (err: any) {
      return { ok: false, url: url || '', title: '', actions: [], error: `Failed to launch browser: ${err?.message}` };
    }
  }

  session.lastUsed = Date.now();
  const { page } = session;
  const actionResults: BrowseResult['actions'] = [];

  // Clear stale triage state from previous calls
  delete (page as any).__triageMatches;
  delete (page as any).__triageApplied;

  try {
    // Navigate if URL provided
    if (url) {
      await timing.sleep(timing.getPreClickDelay());
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await timing.sleep(timing.getThinkingDelay());
      actionResults.push({ action: 'navigate', result: `Loaded ${url}` });

      // Google Images: scroll to load lazy thumbnails + visual triage
      const isGoogleImages = url.includes('google.com') && (url.includes('tbm=isch') || url.includes('udm=2'));
      if (isGoogleImages) {
        // Scroll to top first, then down to load thumbnails
        await page.evaluate('window.scrollTo(0, 0)');
        await timing.sleep(500);
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 800);
          await timing.sleep(300 + Math.random() * 200);
        }
        // Scroll back to top so screenshot captures the full grid
        await page.evaluate('window.scrollTo(0, 0)');
        await page.waitForTimeout(1500);

        // Visual triage: screenshot the page and identify matching images
        if (extractImages) {
          const screenshot = await page.screenshot({ type: 'png', fullPage: false });
          const triage = await triageImagesWithVision(screenshot as Buffer, instruction, {
            orgId,
            serviceKey: 'smartBrowser.visionTriage',
            outcomeInstanceId: opts.instanceId,
          });
          (page as any).__triageMatches = triage.matches;
          (page as any).__triageApplied = true;
          actionResults.push({
            action: 'visual_triage',
            result: `Identified ${triage.matches.length} matching images at positions [${triage.matches.join(', ')}]. ${triage.reasoning}`,
          });
        }
      }
    }

    // Observe current page
    const dom: SimplifiedDOM = await page.evaluate(DOM_SIMPLIFIER_SCRIPT);
    const pageDescription = formatDOMForLLM(dom);

    // Load relevant browser skills for this domain (learned from user demonstrations)
    let learnedProceduresSection = '';
    try {
      const currentUrl = page.url();
      const hostname = new URL(currentUrl).hostname.replace(/^www\./, '');
      const path = new URL(currentUrl).pathname;

      const { db } = await import('../../db.js');
      const { browserSkills } = await import('@lamdis/db/schema');
      const { eq, and, desc } = await import('drizzle-orm');

      const skills = await db.select()
        .from(browserSkills)
        .where(and(
          eq(browserSkills.orgId, orgId),
          eq(browserSkills.domain, hostname),
        ))
        .orderBy(desc(browserSkills.successCount), desc(browserSkills.updatedAt))
        .limit(10);

      // Filter by URL pattern if specified (substring match on path)
      const matching = skills.filter(s => !s.urlPattern || path.includes(s.urlPattern));

      if (matching.length > 0) {
        const lines: string[] = [];
        for (const skill of matching) {
          lines.push(`### ${skill.name}`);
          if (skill.intent) lines.push(`Intent: ${skill.intent}`);
          const stepLines = (skill.steps || []).map((s: any, i: number) => {
            const parts: string[] = [`  ${i + 1}. ${s.type}`];
            if (s.elementText) parts.push(`text="${s.elementText}"`);
            if (s.selector) parts.push(`selector="${s.selector}"`);
            if (s.value) parts.push(`value="${s.value}"`);
            if (s.key) parts.push(`key="${s.key}"`);
            if (s.url) parts.push(`url="${s.url}"`);
            return parts.join(' ');
          });
          lines.push(stepLines.join('\n'));
          lines.push('');
        }
        learnedProceduresSection = `\n\nLEARNED PROCEDURES FOR THIS SITE (from previous human demonstrations — adapt as needed if the page has changed):\n${lines.join('\n')}`;
        console.log(`[smartBrowser] Loaded ${matching.length} learned skill(s) for ${hostname}`);
      }
    } catch (err: any) {
      console.warn(`[smartBrowser] Failed to load browser skills:`, err?.message);
    }

    // Ask LLM what actions to take
    const llmResponse = await bedrockChatOnce({
      modelId: BROWSER_MODEL,
      meterContext: {
        orgId,
        serviceKey: 'smartBrowser.actionPlanner',
        outcomeInstanceId: opts.instanceId,
      },
      messages: [{
        role: 'user',
        content: `You are controlling a real web browser. Analyze the page and decide what actions to take.

CURRENT PAGE STATE:
${pageDescription}${learnedProceduresSection}

INSTRUCTION: ${instruction}
${extractImages ? '\nALSO: Extract all product/relevant image URLs from the page.' : ''}

${learnedProceduresSection ? 'IMPORTANT: If a learned procedure above matches the current task, prefer its steps. Adapt selectors using the elementText hints when the exact selector no longer exists. If no procedure matches, fall back to first-principles analysis of the page state.' : ''}

Return ONLY a JSON array of actions. Available actions:
- {"action": "click", "selector": "css selector", "reason": "why"}
- {"action": "type", "selector": "css selector", "value": "text to type", "reason": "why"}
- {"action": "scroll", "amount": pixels, "reason": "why"}
- {"action": "wait", "ms": milliseconds, "reason": "why"}
- {"action": "extract_text", "selector": "css selector", "reason": "why"}
- {"action": "extract_images", "reason": "why"} — extracts all visible image URLs
- {"action": "save_image", "selector": "css selector of img element", "fileName": "name.jpg", "reason": "why"} — saves a specific rendered image directly from the browser to the workspace
- {"action": "screenshot", "reason": "why"} — takes a screenshot of the current page and saves it to the workspace
- {"action": "mfa_challenge", "challengeType": "code|sms|email|authenticator", "summary": "description of what the user needs to do"} — signals that MFA/2FA verification is required, takes a screenshot, and stops execution so the user can provide the code
- {"action": "done", "summary": "what was accomplished"}

Use precise CSS selectors from the page state above. Only suggest actions that are possible given the visible elements.`,
      }],
      system: 'You are a browser automation expert. Given a page state, you decide what to click, type, or extract. Always respond with ONLY a valid JSON array. Be precise with selectors — use the exact ones shown in the page state.',
      maxTokens: 2048,
      temperature: 0.2,
    });

    // Parse LLM actions
    let actions: Array<{ action: string; selector?: string; value?: string; amount?: number; ms?: number; reason?: string; summary?: string; fileName?: string; challengeType?: string }> = [];
    try {
      const jsonStr = llmResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      actions = JSON.parse(jsonStr);
      if (!Array.isArray(actions)) actions = [actions];
    } catch {
      // Try to find JSON array in the response
      const arrayMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          actions = JSON.parse(arrayMatch[0]);
          if (!Array.isArray(actions)) actions = [];
        } catch {
          actions = [];
        }
      }
      if (actions.length === 0) {
        actionResults.push({ action: 'llm_parse_error', error: 'Failed to parse LLM response as JSON' });
        // Fallback: if extractImages was requested, auto-extract
        if (extractImages) {
          actions = [{ action: 'extract_images', reason: 'Auto-fallback after LLM parse error' }];
        }
      }
    }

    // Execute each action with human-like timing
    let extractedImages: string[] = [];
    let extractedText = '';
    let screenshotUrl: string | undefined;
    let mfaChallenge: BrowseResult['mfaChallenge'] | undefined;

    for (const act of actions) {
      try {
        switch (act.action) {
          case 'click': {
            if (!act.selector) { actionResults.push({ action: 'click', error: 'No selector' }); break; }
            await timing.sleep(timing.getPreClickDelay());

            // Human-like: move mouse to element first
            const element = await page.$(act.selector);
            if (element) {
              const box = await element.boundingBox();
              if (box) {
                const targetX = box.x + box.width / 2 + (Math.random() * 6 - 3);
                const targetY = box.y + box.height / 2 + (Math.random() * 4 - 2);
                await page.mouse.move(targetX, targetY, { steps: timing.getMouseSteps() });

                // Overshoot correction
                if (timing.shouldOvershoot()) {
                  const off = timing.getOvershootOffset();
                  await page.mouse.move(targetX + off.x, targetY + off.y, { steps: 5 });
                  await timing.sleep(timing.randomRange(50, 120));
                  await page.mouse.move(targetX, targetY, { steps: 5 });
                }

                await timing.sleep(timing.randomRange(80, 200));
                await page.mouse.click(targetX, targetY);
              } else {
                await page.click(act.selector);
              }
            } else {
              await page.click(act.selector);
            }

            await timing.sleep(timing.randomRange(500, 1500));
            actionResults.push({ action: 'click', selector: act.selector, result: `Clicked ${act.reason || act.selector}` });
            break;
          }

          case 'type': {
            if (!act.selector || !act.value) { actionResults.push({ action: 'type', error: 'Missing selector or value' }); break; }
            await timing.sleep(timing.getPreClickDelay());
            await page.click(act.selector);
            await timing.sleep(timing.randomRange(200, 500));

            // Type character by character with human timing
            for (const char of act.value) {
              await page.keyboard.type(char, { delay: timing.getTypingDelay() });
            }

            // Press Enter if it looks like a search
            if (act.value && (act.selector?.includes('search') || act.selector?.includes('[name="q"]') || act.reason?.toLowerCase().includes('search'))) {
              await timing.sleep(timing.randomRange(300, 800));
              await page.keyboard.press('Enter');
              await timing.sleep(timing.getThinkingDelay());
            }

            actionResults.push({ action: 'type', selector: act.selector, result: `Typed "${act.value}"` });
            break;
          }

          case 'scroll': {
            const amount = act.amount || timing.getScrollAmount();

            // Pre-scroll mouse movement
            if (timing.shouldPreScrollMouseMove()) {
              const vp = page.viewportSize();
              if (vp) {
                await page.mouse.move(
                  timing.randomRange(200, vp.width - 200),
                  timing.randomRange(200, vp.height - 200),
                  { steps: timing.getMouseSteps() }
                );
                await timing.sleep(timing.randomRange(200, 400));
              }
            }

            await page.mouse.wheel(0, amount);
            await timing.sleep(timing.getScrollReadDelay());

            // Occasional back-scroll
            if (timing.shouldBackScroll()) {
              await page.mouse.wheel(0, -timing.getBackScrollAmount());
              await timing.sleep(timing.randomRange(800, 1500));
            }

            actionResults.push({ action: 'scroll', result: `Scrolled ${amount}px` });
            break;
          }

          case 'wait': {
            const ms = act.ms || timing.getThinkingDelay();
            await timing.sleep(ms);
            actionResults.push({ action: 'wait', result: `Waited ${ms}ms` });
            break;
          }

          case 'extract_text': {
            if (!act.selector) { actionResults.push({ action: 'extract_text', error: 'No selector' }); break; }
            const text = await page.$eval(act.selector, (el: any) => (el.textContent || el.innerText || '').trim().slice(0, 3000)).catch(() => '');
            extractedText += text + '\n';
            actionResults.push({ action: 'extract_text', selector: act.selector, result: text.slice(0, 200) });
            break;
          }

          case 'extract_images': {
            // NOTE: Uses string eval to avoid esbuild __name transform breaking page.evaluate
            const imgs = await page.evaluate(`(() => {
              var seen = {};
              var results = [];
              function addImg(src, alt, w, h, source) {
                if (!src || src.indexOf('data:') === 0 || seen[src]) return;
                if (/\\b(1x1|pixel|spacer|blank|icon|favicon|badge|button|logo)\\b/i.test(src)) return;
                if (/\\.(svg|ico|gif)$/i.test(src)) return;
                seen[src] = true;
                results.push({ src: src, alt: alt, w: w, h: h, source: source });
              }
              document.querySelectorAll('img').forEach(function(img) {
                var w = img.naturalWidth || img.width || 0;
                var h = img.naturalHeight || img.height || 0;
                addImg(img.src, img.alt || '', w, h, 'img-src');
                addImg(img.getAttribute('data-src'), img.alt || '', w, h, 'data-src');
                addImg(img.getAttribute('data-original'), img.alt || '', w, h, 'data-original');
                addImg(img.getAttribute('data-iurl'), img.alt || '', w, h, 'data-iurl');
                addImg(img.getAttribute('data-lazy-src'), img.alt || '', w, h, 'data-lazy');
                var srcset = img.getAttribute('srcset');
                if (srcset) {
                  var entries = srcset.split(',').map(function(s) { return s.trim().split(/\\s+/); });
                  entries.sort(function(a, b) { return (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0); });
                  if (entries[0] && entries[0][0]) addImg(entries[0][0], img.alt || '', w, h, 'srcset');
                }
              });
              document.querySelectorAll('a[href]').forEach(function(a) {
                var href = a.href;
                if (/\\.(jpg|jpeg|png|webp)(\\?|$)/i.test(href)) addImg(href, '', 0, 0, 'a-href');
              });
              document.querySelectorAll('[style*="background"]').forEach(function(el) {
                var bg = el.style.backgroundImage;
                var m = bg ? bg.match(/url\\(["']?(https?:\\/\\/[^"')]+)/) : null;
                if (m) addImg(m[1], '', 0, 0, 'bg-image');
              });
              return results.filter(function(img) {
                if (img.w > 50 || img.h > 50) return true;
                if (img.source !== 'img-src') return true;
                if (/gstatic\\.com|googleusercontent\\.com|ggpht\\.com/i.test(img.src)) return true;
                return false;
              }).sort(function(a, b) { return (b.w * b.h) - (a.w * a.h); });
            })()`);
            extractedImages = (imgs as any[]).map((i: any) => i.src);

            // Apply visual triage filter if available
            const triageMatches = (page as any).__triageMatches as number[] | undefined;
            if (triageMatches && triageMatches.length > 0) {
              const nonDoodleImages = extractedImages.filter(u => !u.includes('logos/doodles') && !u.includes('Easter'));
              const filtered = triageMatches
                .filter(i => i >= 0 && i < nonDoodleImages.length)
                .map(i => nonDoodleImages[i]);
              if (filtered.length > 0) {
                actionResults.push({ action: 'extract_images', result: `Found ${extractedImages.length} images, triage filtered to ${filtered.length} matches` });
                extractedImages = filtered;
                break;
              }
            }

            actionResults.push({ action: 'extract_images', result: `Found ${(imgs as any[]).length} images` });
            break;
          }

          case 'save_image': {
            if (!act.selector) { actionResults.push({ action: 'save_image', error: 'No selector' }); break; }
            const imgEl = await page.$(act.selector);
            if (!imgEl) { actionResults.push({ action: 'save_image', error: `Element not found: ${act.selector}` }); break; }

            const imgFileName = act.fileName || `browser-image-${Date.now()}.jpg`;
            const instanceId = opts.instanceId || 'default';
            const baseDir = join(process.cwd(), 'data', 'workspaces', instanceId, 'files');
            mkdirSync(baseDir, { recursive: true });
            const savePath = join(baseDir, imgFileName);

            // Try to get the image src and download it via the browser's network context (avoids CORS/403)
            const imgSrc = await imgEl.getAttribute('src') || await imgEl.getAttribute('data-src') || '';
            if (imgSrc && !imgSrc.startsWith('data:')) {
              try {
                // NOTE: String eval to avoid esbuild __name transform
                const response = await page.evaluate(`(async function() {
                  var res = await fetch(${JSON.stringify(imgSrc)});
                  var buf = await res.arrayBuffer();
                  return Array.from(new Uint8Array(buf));
                })()`);
                const bytes = response as number[];
                const { writeFileSync } = await import('fs');
                writeFileSync(savePath, Buffer.from(bytes));
                actionResults.push({ action: 'save_image', result: `Saved ${imgFileName} (${(bytes.length / 1024).toFixed(1)} KB)` });
                break;
              } catch { /* fallback to screenshot */ }
            }

            // Fallback: screenshot the element
            await imgEl.screenshot({ path: savePath, type: 'jpeg', quality: 90 });
            actionResults.push({ action: 'save_image', result: `Saved screenshot of element as ${imgFileName}` });
            break;
          }

          case 'screenshot': {
            const screenshotName = `screenshot-${Date.now()}.png`;
            const instanceId = opts.instanceId || 'default';
            const screenshotDir = join(process.cwd(), 'data', 'workspaces', instanceId, 'files');
            mkdirSync(screenshotDir, { recursive: true });
            const screenshotPath = join(screenshotDir, screenshotName);
            const screenshotBuf = await page.screenshot({ fullPage: false, type: 'png' });
            writeFileSync(screenshotPath, screenshotBuf);
            screenshotUrl = `/orgs/instances/${instanceId}/files/${screenshotName}`;
            actionResults.push({ action: 'screenshot', result: `Saved screenshot as ${screenshotName}` });
            break;
          }

          case 'mfa_challenge': {
            // Take screenshot of the MFA challenge page
            const mfaScreenshotName = `mfa-challenge-${Date.now()}.png`;
            const mfaInstanceId = opts.instanceId || 'default';
            const mfaDir = join(process.cwd(), 'data', 'workspaces', mfaInstanceId, 'files');
            mkdirSync(mfaDir, { recursive: true });
            const mfaPath = join(mfaDir, mfaScreenshotName);
            const mfaBuf = await page.screenshot({ fullPage: false, type: 'png' });
            writeFileSync(mfaPath, mfaBuf);
            screenshotUrl = `/orgs/instances/${mfaInstanceId}/files/${mfaScreenshotName}`;

            mfaChallenge = {
              detected: true,
              challengeType: act.challengeType || 'code',
              summary: act.summary || 'MFA verification required',
            };

            // Extend session timeout — user needs time to get their code
            if (session) session.lastUsed = Date.now() + (MFA_IDLE_TIMEOUT_MS - IDLE_TIMEOUT_MS);

            actionResults.push({
              action: 'mfa_challenge',
              result: `MFA detected (${mfaChallenge.challengeType}): ${mfaChallenge.summary}. Screenshot saved.`,
            });
            // Stop executing further actions — the page is waiting for user input
            break;
          }

          case 'done': {
            actionResults.push({ action: 'done', result: act.summary || 'Completed' });
            break;
          }

          default:
            actionResults.push({ action: act.action, error: `Unknown action: ${act.action}` });
        }
      } catch (err: any) {
        actionResults.push({ action: act.action, selector: act.selector, error: err?.message?.slice(0, 150) });
      }

      // Stop processing further actions if MFA was detected
      if (mfaChallenge?.detected) break;
    }

    // Get final page state
    const finalDom: SimplifiedDOM = await page.evaluate(DOM_SIMPLIFIER_SCRIPT).catch(() => ({ url: page.url(), title: '', links: [], buttons: [], inputs: [], images: [], headings: [], mainText: '', metaTags: [], jsonLd: [] }));

    // If extractImages was requested and LLM didn't do it, do it now
    if (extractImages && extractedImages.length === 0) {
      // NOTE: Uses string eval to avoid esbuild __name transform breaking page.evaluate
      const imgs = await page.evaluate(`(() => {
        var seen = {};
        var results = [];
        function addImg(src, w, h) {
          if (!src || src.indexOf('data:') === 0 || seen[src]) return;
          if (/\\b(1x1|pixel|spacer|blank|icon|favicon)\\b/i.test(src)) return;
          seen[src] = true;
          results.push({ src: src, w: w, h: h });
        }
        document.querySelectorAll('img').forEach(function(img) {
          var w = img.naturalWidth || img.width || 0;
          var h = img.naturalHeight || img.height || 0;
          addImg(img.src, w, h);
          addImg(img.getAttribute('data-src'), w, h);
          addImg(img.getAttribute('data-original'), w, h);
          addImg(img.getAttribute('data-iurl'), w, h);
          addImg(img.getAttribute('data-lazy-src'), w, h);
        });
        document.querySelectorAll('a[href]').forEach(function(a) {
          var href = a.href;
          if (/\\.(jpg|jpeg|png|webp)(\\?|$)/i.test(href)) addImg(href, 0, 0);
        });
        return results.filter(function(img) { return img.w > 80 || img.h > 80 || img.w === 0; })
          .sort(function(a, b) { return (b.w * b.h) - (a.w * a.h); });
      })()`);
      extractedImages = (imgs as any[]).map((i: any) => i.src);

      // Apply visual triage filter if available
      const fallbackTriage = (page as any).__triageMatches as number[] | undefined;
      if (fallbackTriage && fallbackTriage.length > 0) {
        const nonDoodle = extractedImages.filter(u => !u.includes('logos/doodles') && !u.includes('Easter'));
        const filtered = fallbackTriage.filter(i => i >= 0 && i < nonDoodle.length).map(i => nonDoodle[i]);
        if (filtered.length > 0) extractedImages = filtered;
      }
    }

    const triageApplied = !!(page as any).__triageApplied;

    return {
      ok: true,
      url: page.url(),
      title: finalDom.title || '',
      actions: actionResults,
      extractedImages: extractedImages.length > 0 ? extractedImages.slice(0, 30) : undefined,
      extractedText: extractedText || undefined,
      pageState: formatDOMForLLM(finalDom).slice(0, 2000),
      triageApplied,
      screenshotUrl,
      mfaChallenge,
    };

  } catch (err: any) {
    return {
      ok: false,
      url: page.url(),
      title: '',
      actions: actionResults,
      error: err?.message || 'Browser error',
    };
  }
}

/** Close all browser sessions */
export async function closeAllSessions(): Promise<void> {
  for (const [key, session] of sessions) {
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
    sessions.delete(key);
  }
}
