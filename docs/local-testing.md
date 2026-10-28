# Local testing on Windows

Run commands from the repository root in PowerShell. There are **no default accounts** in your normal database. The sample accounts below are created only by the optional, isolated demo setup. Never use these public sample passwords for a real account.

## Read the verification email for the account you just registered

With `EMAIL_TRANSPORT=local`, emails are saved as private JSON files in the repository's `.local/mail` directory. They are not delivered to Gmail/Outlook. The root `npm run dev` command starts the mail worker; running only `apps/web` does not start that worker.

From the repository root, replace the sample recipient with the email you registered:

```powershell
Get-ChildItem .local\mail -Filter *.json |
  Sort-Object LastWriteTime -Descending |
  ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json } |
  Where-Object { $_.to -eq 'YOUR-REGISTERED-EMAIL' -and $_.subject -eq 'Verify your Psycocity email' } |
  Select-Object -First 1 |
  Format-List to, subject, text
```

Open the `http://localhost:5173/applicant/verify-email?...` link from the message's `text` in your browser, then press **Verify email**. Use the newest message; resending invalidates older verification links. You can also open `.local/mail` in your editor and inspect the latest matching JSON file. Do not share/commit these files: they contain usable private links.

If no file appears, confirm `EMAIL_TRANSPORT=local`, MongoDB is running, and the terminal running `npm run dev` includes the mail worker. Check the recipient and use **Resend verification**. For a real inbox later, configure Resend and a verified sender domain instead of the local adapter.

## Optional: create applicant, student, model and admin demo accounts

This creates a separate local **`psycocity_demo_test`** database. Existing registrations in the normal `psycocity` database are untouched. Stop `npm run dev` first with Ctrl+C. Back up your `.env` locally outside Git, then temporarily use:

```dotenv
NODE_ENV=development
APP_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/psycocity_demo_test?replicaSet=rs0&directConnection=true
EMAIL_TRANSPORT=local
STORAGE_DRIVER=local
PAYSTACK_SECRET_KEY=
POLICIES_APPROVED=true
OUTBOX_ENCRYPTION_KEY=
TRUST_PROXY_CIDRS=
```

If you already configured an explicit `OUTBOX_ENCRYPTION_KEY`, **keep its existing value** rather than clearing/changing it. Do not set a deployment stage for this local demo. This configuration enables synthetic local testing only, not real applicant collection.

With Docker Desktop running:

```powershell
npm run db:up
npm run demo:seed
npm run dev
```

Open http://localhost:5173. The initial password for **all four demo accounts** is:

```text
Psycocity demo passphrase 2026!
```

| Role | Email | Optional member username | Sign-in page | Initial state |
| --- | --- | --- | --- | --- |
| Applicant | `applicant@psycocity.test` | — | `/applicant/login` | Verified email, submitted academy application available for staff review |
| Academy student | `student@psycocity.test` | `demo_student` | `/member/login` | Activated student membership; admin must enrol the student in a cohort |
| Represented model | `model@psycocity.test` | `demo_model` | `/member/login` | Activated model membership; complete profile/photos and request staff publication review |
| Admin | `admin@psycocity.test` | — | `/admin/login` | Staff invitation activated; authenticator setup is still required |

The admin must choose **Set up authenticator**, scan/import the private setup key into an authenticator app, enter its current six-digit code and save the recovery codes before opening administration. There is no shared/fixed MFA code and no MFA bypass. Use separate browser profiles or a private window when testing admin and member accounts side by side.

The student/model sample payments are **simulated test evidence**, created through the settlement and activation services in this isolated database. No Paystack call, real charge or production payment verification occurs. The script refuses production/deployment mode, non-local email/storage, a nonempty Paystack key and other database names/hosts. It never resets existing passwords or MFA. Rerunning a completed demo leaves accounts unchanged; the listed password is only the initial password. An interrupted/occupied setup is refused rather than overwritten.

To return to your original registered account, stop development, restore the original `.env` database URI (normally `psycocity`) and restart. Accounts in the two databases are separate. Local mail files share `.local/mail`, so filter by recipient.

To test the real member admissions journey later: register an applicant, verify email, submit, have staff assess/accept, complete an actual Paystack **test** transaction, then use the emailed membership invitation. Do not use the demo seed to claim real provider integration.

For your normal database's first admin, use the trusted bootstrap command instead of demo credentials:

```powershell
npm run admin:bootstrap -- --email admin-local@psycocity.test
```

Keep the root `npm run dev` process running in another terminal. Find the staff invitation in `.local/mail` using the same PowerShell pipeline above, changing the recipient and subject to `Your Psycocity staff invitation`. Open its link, choose your own password and complete MFA. If initial staff setup already exists, use the existing staff invitation/login flow; the CLI will not replace it.

## Other sample form values

Use synthetic data only:

| Field | Sample |
| --- | --- |
| Adult legal/professional name | `Demo Alex Model` |
| Adult birth date | `2000-01-01` |
| Applicant email to register yourself | `applicant2@psycocity.test` |
| Minor birth date for guardian-flow testing | `2009-01-01` (17 as of October 2026) |
| Guardian | `Demo Guardian`, `guardian@psycocity.test` |
| Phone | `08012345678` |
| Location | Nigeria / Lagos / Ikeja |
| Measurements | Height 175 cm, waist 70 cm, EU shoe size 40 |
| Introduction | `I am using synthetic information to practise the academy and modelling application process.` |
| Academy goals | `Practise runway confidence, posing and professional communication.` |
| Established experience | `Synthetic editorial and runway experience for local testing only.` |
| Booking client | `Demo Fashion Studio`, `client@psycocity.test` |
| Booking message | `This is a synthetic enquiry about a Nigerian editorial campaign. Please discuss model availability and usage.` |

Upload static JPEG/PNG/WebP sample images at least 200×200 pixels and at most 10 MB; use licensed/abstract sample images. Application submission needs all four required photo slots. Public model publication needs at least two selected portfolio photographs, descriptions, cover and complete professional details, followed by staff approval. Academy completion thresholds/curriculum start unset and must be configured deliberately. No graduation automatically grants representation or public publication.

## What the two environment values mean

`OUTBOX_ENCRYPTION_KEY` is a **server encryption master key**, not a Paystack key or login password. It protects queued transactional email and, with a derived key, staff authenticator secrets. In local development, leave it blank: the app generates and reuses `.local/outbox-key`. Keep that file. For deployment, generate one stable, random 32-byte key encoded in base64 and back it up separately. Do not replace/delete it while encrypted mail/MFA records exist; doing so can make them unreadable. Never expose it to the browser or Git.

`TRUST_PROXY_CIDRS` lists the **trusted reverse-proxy IP addresses or network ranges** allowed to supply forwarded client-IP information. It matters when a deployed app sits behind a load balancer/proxy and rate limits need the actual client address. For your direct local setup, leave it blank. Set it in deployment only after verifying the actual proxy peers and blocking direct public access to the API. It is network configuration, not a secret key. Do not use `true` or `0.0.0.0/0`.

## Missing email, invalid links or API restarts

After switching from local MongoDB to Atlas, old `.local/mail` links belong to the previous database and cannot verify an account in the new one. Resending also invalidates older tokens. Keep the intended `MONGODB_URI` consistent across the API and mail worker, then request a fresh link once and open only that message. If the registration request was interrupted, register with the same email again (existing accounts are not overwritten) before requesting verification. If the account is already verified, sign in instead.

For real delivery use `EMAIL_TRANSPORT=resend`, a valid `RESEND_API_KEY` and `EMAIL_FROM` permitted by your verified Resend domain. `.local/mail` contains old local-delivery files; their existence does not prove the active Resend worker is delivering anything. Resend's test sender can restrict recipients to the account owner's email. Use a real mailbox you control, not a `.test` sample address, for external delivery checks.

After changing `.env` or pulling this fix, stop the entire root development command with Ctrl+C, run `git pull` and `npm ci`, then restart `npm run dev`. Both API and worker must reload the same settings/key. Do not run `npm ci`/dependency updates concurrently with the running dev server. API development now watches only source/shared compiled contracts, excluding dependency-directory changes. The worker prints its active transport at startup. Chrome's optional DevTools metadata probe is answered quietly with 404 and is unrelated to mail.

In a second PowerShell terminal, inspect safe delivery status:

```powershell
npm run mail:status -- --email YOUR-REGISTERED-EMAIL
```

For a compiled deployment image, the equivalent command is `node apps/api/dist/mail/status.js --email YOUR-REGISTERED-EMAIL` with its existing environment.

This reads the current configuration/database without sending email or printing your URI credentials, API key, recipient list, message bodies or private links. It shows transport, database name, origin, key/sender presence, whether the requested account exists/is verified, active verification-token count and recent queue states. You can share this command's output for troubleshooting; do not share your `.env` or verification link.

| Result/code | Action |
| --- | --- |
| Transport `local` | Emails go to `.local/mail`; select `resend` and restart everything for actual inbox delivery |
| Account not found | Confirm the selected database, then register there; resend intentionally does not disclose unknown accounts through the public UI |
| Pending with zero attempts | Confirm the root dev command's mail worker is running and connected to the same database |
| `RESEND_AUTH_REJECTED` | Check the configured Resend key and its permissions |
| `RESEND_SENDER_OR_PERMISSION_REJECTED` | Check sender/domain verification, test-recipient restrictions and key permissions in Resend |
| `RESEND_REQUEST_REJECTED` | Inspect Resend's dashboard for sender/recipient or request validation details |
| `RESEND_RATE_LIMITED` / `RESEND_UNAVAILABLE` | Check Resend/network status; delivery retries are bounded |
| `PAYLOAD_UNREADABLE` | Restore the original encryption key and restart both processes; do not generate a replacement to bypass this error |
| `TOKEN_SUPERSEDED` / `PAYLOAD_EXPIRED` | Expected cancellation/expiry; request and use a new link rather than retrying an obsolete message |
| `DELIVERY_FAILED` | Check network/worker configuration and delivery logs; raw provider error bodies are deliberately not printed |
| Delivered | Provider handoff completed; check Resend delivery/bounce logs and spam folder to establish actual inbox delivery |

Auth email jobs now expire with their tokens and queued superseded verification/reset messages are cancelled, preventing old queued links from being delivered after a replacement request. A message already accepted by an email provider cannot be recalled; always use the newest link from the active database. Resend-verification requests are limited to three per address per hour; repeated requests beyond that do not create another token, so avoid repeatedly clicking resend.

## Refined staff and admissions workflow

After pulling this update, run `npm ci` at the repository root, then `npm run dev`. Startup ensures additive indexes and identifies the original super admin from the consumed bootstrap invitation. An existing seeded admin does not need a second account. If the original invitation evidence is missing, the migration does not guess or grant privileges to another user; investigate the bootstrap history before changing records manually.

- Open `/admin` for the sidebar workspace. On smaller screens, use **Open navigation**.
- Only the original **Super admin** can invite staff from **Staff access** and deactivate another administrator. Deactivation removes administrative access and revokes sessions/browser trust while retaining audit records. Ordinary administrators retain admissions, academy, catalogue, payment and other operational controls.
- First browser sign-in requires authenticator setup/verification. Successful verification trusts that browser for seven days; subsequent sign-ins still need email/password. Sign-out preserves trust. **Forget this browser** revokes it. Inviting/removing staff still requires a code verified within the last 15 minutes; use **Verify security** if asked. Codes are never saved as login tokens.
- Under **Admissions**, start review, select an event and check the automatically filled, editable WAT slot. Send the assignment. The applicant sees **Confirm attendance**, **Decline** and **Request a different time** in the applicant portal. The latter asks for a reason and proposed WAT slot; staff must assign/confirm availability.
- Under **Appointments & decisions**, use the action-centre filter for reschedule requests or confirmed/finished appointments. After the appointment finishes, record attendance and a visible assessment note, then follow **Accept / reject and leave decision note**. Acceptance issues the correct track offer. Rejection defaults to 30 days (editable 1–365); the portal shows when reapplication becomes available and blocks both-track bypasses.
- Application height defaults to feet/inches, body measurements to cm and shoe sizes to UK. Existing saved EU/US choices remain unchanged. Save before exporting: **Download application PDF** and **Print application** export saved data, with the **Include application pictures** checkbox off initially. The print link opens your browser's PDF viewer; use its print/save controls.

For manual acceptance, exercise a new and remembered browser, password reset, regular-staff roster denial, reschedule/reconfirmation, finished assessment, acceptance and rejection. Check 360, 480, 720, 1024 and 1444 px layouts, keyboard drawer navigation and your browser's native PDF print dialog. External email/payment/storage testing still needs the configuration above; local test success does not certify provider delivery.
