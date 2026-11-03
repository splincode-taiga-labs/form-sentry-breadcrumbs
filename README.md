# form-sentry-breadcrumbs

Privacy-first [Sentry](https://sentry.io/) breadcrumbs for Angular reactive and template-driven forms.

- Tracks value **changes** (never their values), validity status, dirty/touched state, submit and reset events.
- Throttles rapid changes to at most one immediate and one trailing breadcrumb per 500 ms window.
- Does not read/serialize `form.value`, `getRawValue()`, validation errors or DOM input values.
- Does not include control names/paths by default. Opt in only for forms with safe, static control keys.
- Works with standalone Angular components and `@sentry/angular` already initialized by your app.

## Install

When published, install the library alongside Angular Forms and Sentry:

```bash
npm install form-sentry-breadcrumbs @sentry/angular
```

> The package is not published to npm yet. For now, build from source using `npm install && npm run build`.

## Directive: automatic tracking

```ts
import {Component} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {SentryFormBreadcrumbsDirective} from 'form-sentry-breadcrumbs';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, SentryFormBreadcrumbsDirective],
  template: `
    <form [formGroup]="profile" sentryFormBreadcrumbs="profile">
      <input formControlName="email" type="email" />
      <button type="submit">Save</button>
    </form>
  `,
})
export class ProfileComponent {
  readonly profile = new FormGroup({email: new FormControl('')});
}
```

For `FormsModule`, add `sentryFormBreadcrumbs="profile"` to the `<form>` with `ngForm`.
The directive detects a replaced `[formGroup]` and unsubscribes on destruction.

To restrict events or expose safe control paths:

```html
<form [formGroup]="profile"
      sentryFormBreadcrumbs="profile"
      [sentryFormBreadcrumbsOptions]="{events: ['change', 'status', 'submit'], includeControlPath: true}">
</form>
```

**Privacy:** `includeControlPath: true` may reveal sensitive information if you use
user-generated keys (for example, an email address as a `FormRecord` key).
Avoid enabling it on such forms. No raw values are sent even with this option.

## Service: manually watch a form or record an action

```ts
import {DestroyRef, inject, Injectable} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {FormBreadcrumbsService} from 'form-sentry-breadcrumbs';

@Injectable()
export class ExampleService {
  private readonly breadcrumbs = inject(FormBreadcrumbsService);
  private readonly destroyRef = inject(DestroyRef);

  watch(form: FormGroup): void {
    const subscription = this.breadcrumbs.watch(form, 'profile', {
      events: ['change', 'status', 'submit'],
      changeThrottleMs: 500,
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  onSaved(): void {
    this.breadcrumbs.trackAction('profile', 'submit-success');
  }
}
```

**Do not** pass personal data, user-generated strings, raw error messages or field values as
form identifiers or action names; these are developer-defined labels.

Breadcrumbs look like this:

```json
{
  "category": "form",
  "type": "user",
  "level": "warning",
  "message": "profile: status",
  "data": {"form": "profile", "event": "status", "status": "INVALID"}
}
```

These breadcrumbs are stored in Sentry's current scope and attach to subsequent error events,
subject to your existing SDK configuration and breadcrumb limits.

## Development

```bash
npm install
npm test
npm run build
```

CI runs both tests and an Angular Package Format library build. Sentry should be initialized
in the consuming app; this package does not call `Sentry.init()`.
