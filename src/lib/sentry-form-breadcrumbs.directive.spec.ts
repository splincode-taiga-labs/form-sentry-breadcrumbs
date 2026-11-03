import {Component, provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {addBreadcrumb} from '@sentry/angular';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SentryFormBreadcrumbsDirective} from './sentry-form-breadcrumbs.directive';

vi.mock('@sentry/angular', () => ({addBreadcrumb: vi.fn()}));

@Component({
    standalone: true,
    imports: [ReactiveFormsModule, SentryFormBreadcrumbsDirective],
    template: `
        <form [formGroup]="form" sentryFormBreadcrumbs="checkout"
              [sentryFormBreadcrumbsOptions]="options">
            <input formControlName="email" />
            <button type="submit">Save</button>
        </form>
    `,
})
class HostComponent {
    form = new FormGroup({email: new FormControl('')});
    options = {events: ['touched', 'submit'] as const};
}

beforeEach(() => {
    TestBed.configureTestingModule({
        imports: [HostComponent],
        providers: [provideZonelessChangeDetection()],
    });
});

afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
});

describe('SentryFormBreadcrumbsDirective', () => {
    it('tracks a form event and stops when its host is destroyed', () => {
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();

        const form = fixture.componentInstance.form;
        form.controls.email.markAsTouched();
        expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({message: 'checkout: touched'}));

        vi.mocked(addBreadcrumb).mockClear();
        fixture.destroy();
        form.controls.email.markAsUntouched();
        form.controls.email.markAsTouched();
        expect(addBreadcrumb).not.toHaveBeenCalled();
    });

    it('re-subscribes when the input FormGroup instance changes', () => {
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
        const oldForm = fixture.componentInstance.form;
        const nextForm = new FormGroup({email: new FormControl('')});

        fixture.componentInstance.form = nextForm;
        fixture.detectChanges();
        oldForm.controls.email.markAsTouched();
        expect(addBreadcrumb).not.toHaveBeenCalled();

        nextForm.controls.email.markAsTouched();
        expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({message: 'checkout: touched'}));
        fixture.destroy();
    });

    it('records native form submit via Angular forms events', () => {
        const fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', {
            bubbles: true,
            cancelable: true,
        }));

        expect(addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({message: 'checkout: submit'}));
        fixture.destroy();
    });
});
