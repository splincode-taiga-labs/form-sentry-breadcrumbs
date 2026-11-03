import {Injectable} from '@angular/core';
import {
    AbstractControl,
    FormArray,
    FormGroup,
    FormResetEvent,
    FormSubmittedEvent,
    PristineChangeEvent,
    StatusChangeEvent,
    TouchedChangeEvent,
    ValueChangeEvent,
} from '@angular/forms';
import {addBreadcrumb} from '@sentry/angular';
import {asyncScheduler, merge, Subscription} from 'rxjs';
import {filter, map, throttleTime} from 'rxjs/operators';

/** Only event metadata is recorded, never form values or validation error objects. */
export type FormBreadcrumbEvent =
    | 'change'
    | 'status'
    | 'dirty'
    | 'pristine'
    | 'touched'
    | 'untouched'
    | 'submit'
    | 'reset';

export interface FormBreadcrumbsOptions {
    /** Turn tracking off without destroying the directive. Defaults to true. */
    readonly enabled?: boolean;
    /** Which events to record. Defaults to all of them. */
    readonly events?: readonly FormBreadcrumbEvent[];
    /** Throttles rapid change events (leading and trailing); defaults to 500 ms. */
    readonly changeThrottleMs?: number;
    /**
     * Opt in to form control names/indices. Dynamic control keys can contain PII.
     * Defaults to false.
     */
    readonly includeControlPath?: boolean;
}

type RecordedEvent = {
    readonly kind: FormBreadcrumbEvent;
    readonly source: AbstractControl;
    readonly status?: 'VALID' | 'INVALID' | 'PENDING' | 'DISABLED';
};

const DEFAULT_EVENTS: readonly FormBreadcrumbEvent[] = [
    'change',
    'status',
    'dirty',
    'pristine',
    'touched',
    'untouched',
    'submit',
    'reset',
];

/** Resolves only control names/array indices; never reads control.value. */
function findControlPath(root: AbstractControl, target: AbstractControl): string | undefined {
    if (root === target) {
        return undefined;
    }

    const visit = (control: AbstractControl, path: string): string | undefined => {
        if (control === target) {
            return path;
        }

        if (control instanceof FormArray) {
            for (const [index, child] of control.controls.entries()) {
                const found = visit(child, `${path}[${index}]`);

                if (found !== undefined) {
                    return found;
                }
            }
        } else if (control instanceof FormGroup) {
            for (const [name, child] of Object.entries(control.controls)) {
                const found = visit(child, path ? `${path}.${name}` : name);

                if (found !== undefined) {
                    return found;
                }
            }
        }

        return undefined;
    };

    return visit(root, '');
}

function stateEvent(event: unknown): RecordedEvent | null {
    if (event instanceof StatusChangeEvent) {
        return {kind: 'status', source: event.source, status: event.status};
    }

    if (event instanceof PristineChangeEvent) {
        return {kind: event.pristine ? 'pristine' : 'dirty', source: event.source};
    }

    if (event instanceof TouchedChangeEvent) {
        return {kind: event.touched ? 'touched' : 'untouched', source: event.source};
    }

    if (event instanceof FormSubmittedEvent) {
        return {kind: 'submit', source: event.source};
    }

    if (event instanceof FormResetEvent) {
        return {kind: 'reset', source: event.source};
    }

    return null;
}

/** Collects privacy-first Angular Forms breadcrumbs via the application's Sentry SDK. */
@Injectable({providedIn: 'root'})
export class FormBreadcrumbsService {
    /**
     * Observe a reactive or template-driven form. The caller owns the subscription.
     * Use the directive for automatic subscription management.
     */
    watch(form: AbstractControl, formName: string, options: FormBreadcrumbsOptions = {}): Subscription {
        if (options.enabled === false) {
            return new Subscription();
        }

        const allowed = new Set(options.events ?? DEFAULT_EVENTS);
        const delay = options.changeThrottleMs ?? 500;

        if (!Number.isFinite(delay) || delay < 0) {
            throw new RangeError('changeThrottleMs must be a non-negative finite number');
        }

        // Map value events BEFORE buffering, so the potentially sensitive `value`
        // property is not retained in the RxJS scheduler.
        const changes$ = form.events.pipe(
            filter((event): event is ValueChangeEvent<unknown> => event instanceof ValueChangeEvent),
            map((event): RecordedEvent => ({kind: 'change', source: event.source})),
            throttleTime(delay, asyncScheduler, {leading: true, trailing: true}),
        );
        const state$ = form.events.pipe(
            filter((event) => !(event instanceof ValueChangeEvent)),
            map(stateEvent),
            filter((event): event is RecordedEvent => event !== null),
        );

        return merge(changes$, state$).subscribe((event) => {
            if (allowed.has(event.kind)) {
                this.write(formName, event.kind, event.status, options.includeControlPath
                    ? findControlPath(form, event.source)
                    : undefined);
            }
        });
    }

    /** Record a static, developer-defined action (e.g. 'submit-success'). Never pass user input. */
    trackAction(formName: string, action: string): void {
        addBreadcrumb({
            category: 'form',
            type: 'user',
            level: 'info',
            message: `${formName}: ${action}`,
            data: {form: formName, event: action},
        });
    }

    private write(
        formName: string,
        event: FormBreadcrumbEvent,
        status?: RecordedEvent['status'],
        controlPath?: string,
    ): void {
        addBreadcrumb({
            category: 'form',
            type: 'user',
            level: event === 'status' && status === 'INVALID' ? 'warning' : 'info',
            message: `${formName}: ${event}`,
            data: {
                form: formName,
                event,
                ...(status === undefined ? {} : {status}),
                ...(controlPath === undefined ? {} : {control: controlPath}),
            },
        });
    }
}
