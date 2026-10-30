# Contributing

Every member must have their own commits in this repository (course requirement M8), so please work through branches and pull requests rather than editing `main` directly.

## Workflow

1. Pick or create an issue and assign yourself.
2. Create a branch from `main`:
   - `feat/<short-name>` — new feature (e.g. `feat/bh1750-driver`)
   - `fix/<short-name>` — bug fix
   - `docs/<short-name>` — documentation / report material
   - `test/<short-name>` — test scripts and measured data
3. Commit small, focused changes (see message format below).
4. Make sure both firmware projects build: `pio run -d firmware/sensor_node` and `pio run -d firmware/gateway`.
5. Open a pull request, fill in the template, link the issue (`Closes #12`) and ask one teammate to review.
6. Merge after review and a green CI build. Delete the branch.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(gateway): add MQTTS connection to NETPIE
fix(node): retry ESP-NOW send when ACK times out
docs: add wiring diagram for servo rail
test: log packet delivery rate over 1 h
```

Scopes: `node`, `gateway`, `common`, `dashboard`, `docs`, `tests`, `ci`.

## Code style

- C/C++ is formatted with `.clang-format` (run `clang-format -i <file>` or enable format-on-save in VS Code).
- No blocking work inside ISRs or ESP-NOW callbacks — enqueue and return.
- Keep pin numbers in one place (see the pin map in the README).
- Prefer `constexpr` / `static const` over `#define` for new constants.

## Secrets

Never commit Wi-Fi passwords, NETPIE tokens, API keys or webhook URLs. Put them in `firmware/gateway/include/secrets.h` (git-ignored) and keep `secrets.example.h` up to date with placeholder values. If a secret is committed by mistake, rotate it immediately — deleting the commit is not enough.

## Ownership

| Area | Owner |
|---|---|
| Message format, integration, AI | รชาทัช บุญพัฒน์ |
| `firmware/sensor_node`, BH1750 driver | ฐากูร นันตสุวรรณ |
| `firmware/gateway`, NETPIE, INA219 driver | นรินธร ยางงาม |
| `dashboard/`, Discord alerts | ปุณยวีร์ พัฒนประดิษฐ์ |
| `tests/`, timeline, filter mechanism | กษิดิศ ประจงการ |
