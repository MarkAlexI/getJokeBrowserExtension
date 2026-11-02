# Changelog

## 2.0.1 · 2026-11-02

- Fix JokeAPI Safe mode requests: send the bare `safe-mode` flag instead of `safe-mode=`.
- Align the API blacklist with local Safe mode validation to avoid rejecting flagged responses after download.
- Disable and uncheck Dark in Safe mode; disable categories unavailable for the selected joke language.
- Select only available categories, retain compatible choices, and recover old impossible selections before fetching.
- Add Ukrainian, Polish, German, French and Spanish interface, errors, accessibility labels and privacy text.
- Keep the interface locale independent from the joke language and preserve browser-specific identities and storage-only permissions.

## 2.0.0 · 2026-11-02

- New warm visual identity, custom icon, responsive popup and redesigned settings.
- Choose one or more joke categories and keep the existing five joke languages.
- Reveal two-part punchlines when ready, or show them immediately in Settings.
- Copy complete jokes with one click.
- Light, dark and device-matched appearance.
- Loading, retry, timeout, unavailable-service, empty-result and rate-limit states.
- Cancel outdated requests and reject late responses after settings change.
- Reuse a matching locally cached joke during service failures for up to 24 hours.
- Validate saved preferences and preserve existing language and Safe mode choices.
- Open the extension using the declared keyboard shortcut.
- Remove the unused Firefox webRequest permission; both variants require storage only.
- Shared browser code and deterministic Firefox/Chrome packaging.

## Previous versions

Firefox 1.13.0 and Chrome 1.12.0 are the release baselines for this update.
