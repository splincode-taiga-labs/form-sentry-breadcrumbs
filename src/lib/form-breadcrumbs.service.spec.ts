import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {addBreadcrumb} from '@sentry/angular';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {FormBreadcrumbsService} from './form-breadcrumbs.service';

vi.mock('@sentry/angular', () => ({addBreadcrumb: vi.fn()}));

const sentry = vi.mocked(addBreadcrumb);

function makeForm() {
    return new FormGroup({
        email: new FormControl(''),
        contacts: new FormArray([new FormGroup({phone: new FormControl('')})]),
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('FormBreadcrumbsService', () => {
    it('records a change without values, including for sensitive-looking inputs', () => {
        const form = makeForm();
        const subscription = new FormBreadcrumbsService().watch(form, 'profile', {events: ['change']});

        form.controls.email.setValue('secret@example.com');

        expect(sentry).toHaveBeenCalledOnce();
        expect(sentry).toHaveBeenCalledWith(expect.objectContaining({
            category: 'form',
            message: 'profile: change',
            data: {form: 'profile', event: 'change'},
        }));
        expect(JSON.stringify(sentry.mock.calls)).not.toContain('secret@example.com');
        subscription.unsubscribe();
    });

    it('does not include error payloads or control names by default', () => {
        const form = makeForm();
        const subscription = new FormBreadcrumbsService().watch(form, 'profile', {events: ['status']});

        form.controls.email.setErrors({privateError: {actualValue: 'top-secret'}});

        expect(sentry).toHaveBeenCalledWith(expect.objectContaining({
            level: 'warning',
            data: {form: 'profile', event: 'status', status: 'INVALID'},
        }));
        expect(JSON.stringify(sentry.mock.calls)).not.toContain('top-secret');
        expect(JSON.stringify(sentry.mock.calls)).not.toContain('email');
        subscription.unsubscribe();
    });

    it('uses safe nested control paths only when explicitly enabled', () => {
        const form = makeForm();
        const subscription = new FormBreadcrumbsService().watch(form, 'profile', {
            events: ['touched'],
            includeControlPath: true,
        });

        form.controls.contacts.at(0).controls.phone.markAsTouched();

        expect(sentry).toHaveBeenCalledWith(expect.objectContaining({
            data: {form: 'profile', event: 'touched', control: 'contacts[0].phone'},
        }));
        subscription.unsubscribe();
    });

    it('records changes to pristine/dirty state and reset', () => {
        const form = makeForm();
        const subscription = new FormBreadcrumbsService().watch(form, 'profile', {
            events: ['dirty', 'pristine', 'reset'],
        });

        form.controls.email.markAsDirty();
        form.controls.email.markAsPristine();
        form.reset();

        const messages = sentry.mock.calls.map(([breadcrumb]) => breadcrumb.message);
        expect(messages).toContain('profile: dirty');
        expect(messages).toContain('profile: pristine');
        expect(messages).toContain('profile: reset');
        subscription.unsubscribe();
    });

    it('throttles typing without losing the first or last change', async () => {
        vi.useFakeTimers();
        const form = makeForm();
        const subscription = new FormBreadcrumbsService().watch(form, 'profile', {
            events: ['change'],
            changeThrottleMs: 250,
        });

        form.controls.email.setValue('a');
        form.controls.email.setValue('ab');
        form.controls.email.setValue('abc');
        expect(sentry).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(250);
        expect(sentry).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(sentry.mock.calls)).not.toContain('abc');
        subscription.unsubscribe();
    });

    it('does not emit after unsubscribe or when disabled', () => {
        const form = makeForm();
        const service = new FormBreadcrumbsService();
        const disabled = service.watch(form, 'profile', {enabled: false});
        const active = service.watch(form, 'profile', {events: ['touched']});
        active.unsubscribe();

        form.controls.email.markAsTouched();
        expect(sentry).not.toHaveBeenCalled();
        disabled.unsubscribe();
    });

    it('records static manual actions without injecting a value object', () => {
        new FormBreadcrumbsService().trackAction('profile', 'submit-success');

        expect(sentry).toHaveBeenCalledWith({
            category: 'form',
            type: 'user',
            level: 'info',
            message: 'profile: submit-success',
            data: {form: 'profile', event: 'submit-success'},
        });
    });

    it('rejects invalid throttle settings instead of scheduling undefined behavior', () => {
        const form = makeForm();
        expect(() => new FormBreadcrumbsService().watch(form, 'profile', {
            changeThrottleMs: -1,
        })).toThrow(RangeError);
    });
});
