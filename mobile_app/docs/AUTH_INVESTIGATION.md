# Admin / Service Provider authentication investigation

Authentication is not implemented. Do not collect production credentials in the current app. If a WebView experiment is approved, use only dedicated test accounts and a non-production build.

## Option B — Expo WebView login test plan

No WebView integration or login test has been performed. Keep this checklist for a separately approved investigation.

- [ ] **NOT YET TESTED** — Log in using dedicated test accounts only (one Admin and one Service Provider); verify the existing LOCAL login page is the intended trusted origin before entering credentials.
- [ ] **NOT YET TESTED** — Verify role permissions: Admin routes/data are inaccessible to a Service Provider and Service Provider capabilities are inaccessible to an Admin where not authorized.
- [ ] **NOT YET TESTED** — Close the app completely, reopen it and verify whether the session persists and whether persistence matches the approved security policy.
- [ ] **NOT YET TESTED** — Log out and verify secure session termination, including back navigation, app restart and any server-side session revocation behavior.
- [ ] **NOT YET TESTED** — Verify no password, access token, cookie, authorization header or session secret is exposed in JavaScript, logs, deep links, screenshots, local storage, crash reports or app-visible network/debug output.
- [ ] **NOT YET TESTED** — Verify allowed-origin navigation, external links, TLS behavior, WebView storage clearing and behavior after role/account revocation.

Do not promote a WebView sign-in into the production app until all checks pass and the security review approves it. The current app shows an authentication-under-investigation placeholder and does not embed a WebView.
