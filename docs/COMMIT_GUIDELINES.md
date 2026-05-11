# Git Commit Message Guidelines

Clear commit messages make code reviews faster, debugging easier, and history more useful. Follow this format for all commits.

---

## 1. Commit Message Structure

```
<type>(<scope>): <short summary>

<body>

<footer>
```

Only the **header** is required. Body and footer are optional.

---

## 2. Header Rules (Most Important)

### Format
```
type(scope): summary
```

### Rules
- Use **lowercase**
- Max **72 characters**
- Use **imperative mood** (“add”, not “added”)
- No period at the end

### ✅ Good Examples
```
feat(auth): add password reset flow
fix(api): handle null response from payment gateway
refactor(ui): simplify button state logic
```

### ❌ Bad Examples
```
Added password reset
fixing bug
FEAT: new feature!!!
```

---

## 3. Commit Types

| Type       | When to use it |
|------------|---------------|
| feat       | New feature |
| fix        | Bug fix |
| docs       | Documentation only |
| style      | Formatting (no logic changes) |
| refactor   | Code changes that don’t add features or fix bugs |
| perf       | Performance improvements |
| test       | Adding or updating tests |
| build      | Build system or dependencies |
| ci         | CI/CD changes |
| chore      | Maintenance tasks |
| revert     | Reverting a previous commit |

---

## 4. Scope (Optional but Recommended)

The scope explains *where* the change happened.

Examples:
```
feat(auth): ...
fix(checkout): ...
docs(readme): ...
```

---

## 5. Body (Optional)

Use the body to explain **why**, not **what**.

### Rules
- Wrap lines at **72 characters**
- Separate from header with a blank line
- Use bullet points if helpful

### Example
```
fix(auth): prevent token refresh loop

The refresh logic retried indefinitely when the
token endpoint returned 401.

- Added retry limit
- Added error logging
```

---

## 6. Footer (Optional)

Use the footer for:
- Breaking changes
- Issue references

### Breaking Changes
```
BREAKING CHANGE: auth tokens are now rotated on login
```

### Issue References
```
Closes #123
Refs #456
```

---

## 7. One Commit = One Purpose

Each commit should:
- Do **one logical thing**
- Be small enough to review easily
- Compile and pass tests (when applicable)

---

## 8. Example Perfect Commit

```
feat(profile): allow users to upload avatar

Adds image upload support using S3.
Validates file type and size before upload.

Closes #342
```
