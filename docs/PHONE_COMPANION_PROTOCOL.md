# Phone Companion Protocol v1

This contract connects the web Power Dialer to a nearby iPhone or Android phone while the
actual carrier call remains on the user's mobile subscription and SIM/eSIM.

The repository includes a production web companion at `/:locale/phone-companion`. It implements
claim, secure local credential storage, heartbeat, polling, acknowledgement, call confirmation,
and terminal call events. Because a browser cannot silently originate a carrier call, both iOS
and Android web companions require a tap. The native notes below describe the optional path to
one-click Android calls and push-driven iPhone delivery.

## Platform truth

| Computer + phone | Supported flow | Carrier subscription | Confirmation |
|---|---|---|---|
| Mac + iPhone | Companion notification, or Apple's Continuity handoff | iPhone | iOS requires a user action for a normal cellular call |
| Windows + iPhone | Companion notification opens the system `tel:` confirmation | iPhone | Required by iOS |
| Windows + Android | Companion uses `ACTION_CALL` after the user grants `CALL_PHONE` | Android | Can be one-click from the web after initial permission |
| Mac + Android | Same Android companion flow; transport is HTTPS, not OS-specific | Android | Can be one-click after initial permission |

The backend cannot silently place an iPhone carrier call. CallKit is for VoIP call UX and does
not grant permission to originate arbitrary cellular calls. The iOS app must show the command
and let the user confirm. The product must never label an iPhone as “direct calling enabled”.

## Pairing

1. Signed-in web client calls `create_phone_pairing_session()`.
2. The RPC returns a QR payload `{version, session_id, secret}` and a six-digit fallback code.
3. Companion calls `phone-device-relay` with `action=claim`, device metadata and either the QR
   secret or fallback code.
4. The relay returns a 256-bit device token exactly once. Store it in iOS Keychain or Android
   Keystore. The database stores only SHA-256 of the token.
5. Companion sends `action=heartbeat` every 30 seconds. Web considers the phone connected only
   while `status=online` and `last_heartbeat_at` is less than 75 seconds old.

Pairing sessions expire after ten minutes, allow at most ten failed attempts, are tenant-bound,
and can only be claimed once. Manual six-digit claims are additionally limited to twenty
attempts per ten-minute client fingerprint; the production gateway must also enforce an IP rate
limit to contain distributed guessing.

## Command lifecycle

Web calls:

```ts
supabase.rpc('create_phone_call_command', {
  p_device_id: deviceId,
  p_phone_number: lead.phone,
  p_lead_id: lead.id,
  p_display_name: lead.name,
  p_idempotency_key: crypto.randomUUID(),
})
```

Device polls `phone-device-relay` using `Authorization: Bearer <device-token>` and
`{"action":"poll"}`. Commands move through:

`queued → delivered → acknowledged → awaiting_confirmation? → ringing → connected → completed`

Terminal alternatives are `failed`, `rejected`, `cancelled`, and `expired`. Every device event
has a stable `event_id`; replaying it is safe. Commands expire after two minutes.

Supabase Realtime publishes `phone_call_commands` for the authenticated web UI. The companion
uses the relay rather than a public database token, so device credentials cannot query arbitrary
tenant data.

## Android implementation

- Kotlin, min SDK 26.
- Store the device token with Android Keystore-backed encrypted preferences.
- Foreground service while “Connected for calling” is enabled; heartbeat every 30 seconds.
- Request `android.permission.CALL_PHONE` with an explicit explanation during onboarding.
- When `direct_carrier_call=true`, validate the E.164 number and invoke
  `Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))`.
- Without permission use `ACTION_DIAL` and report `awaiting_confirmation`.
- Report `acknowledged`, `ringing`, and the best observable terminal state. Android's public APIs
  do not reliably expose every carrier call transition on all OEMs; never fabricate `connected`.

## iOS implementation

- SwiftUI, iOS 17+.
- Store device token in Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- Use APNs for immediate notification plus a foreground heartbeat/poll while the app is open.
- Present lead name and number, then require the user to tap **Call on iPhone**.
- Open `tel:<E.164>` through `UIApplication.open`. Report `awaiting_confirmation` before opening.
- Do not claim a reliable “connected” event for a cellular call; iOS intentionally withholds it.
- A Mac can alternatively use Apple's native Continuity calling, but this is an OS feature and
  not a backend API. The guide should show how to enable “Calls on Other Devices”.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No Twilio, purchased phone number, or per-minute platform telephony subscription is required for
the device plan. The user's mobile operator still charges according to their own subscription.

## Operational checks

- Alert when a device has not heartbeated for 90 seconds.
- Retain call events as an audit trail; redact free-text notes from infrastructure logs.
- Revoke a lost device with `revoke_phone_device(device_id)`.
- Rate-limit claim, heartbeat, poll and event endpoints at the gateway/WAF.
- Rotate device tokens by revoking and pairing again; raw tokens are never recoverable.
