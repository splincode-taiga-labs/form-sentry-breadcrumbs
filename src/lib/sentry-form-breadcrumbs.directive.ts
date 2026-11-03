import {Directive, DoCheck, inject, Input, OnDestroy} from '@angular/core';
import {AbstractControl, ControlContainer} from '@angular/forms';
import {Subscription} from 'rxjs';

import {FormBreadcrumbsOptions, FormBreadcrumbsService} from './form-breadcrumbs.service';

/** Attach to a `<form>` with ReactiveFormsModule or FormsModule imported. */
@Directive({
    selector: 'form[sentryFormBreadcrumbs]',
    standalone: true,
})
export class SentryFormBreadcrumbsDirective implements DoCheck, OnDestroy {
    @Input({required: true}) sentryFormBreadcrumbs = '';
    @Input() sentryFormBreadcrumbsOptions?: FormBreadcrumbsOptions;

    private readonly container = inject(ControlContainer, {self: true, optional: true});
    private readonly service = inject(FormBreadcrumbsService);
    private subscription?: Subscription;
    private trackedControl: AbstractControl | null = null;
    private trackedName?: string;
    private trackedOptions?: FormBreadcrumbsOptions;

    ngDoCheck(): void {
        if (!this.container) {
            throw new Error('sentryFormBreadcrumbs requires ReactiveFormsModule or FormsModule');
        }

        const control = this.container.control;
        const name = this.sentryFormBreadcrumbs;
        const options = this.sentryFormBreadcrumbsOptions;

        if (control === this.trackedControl && name === this.trackedName && options === this.trackedOptions) {
            return;
        }

        this.subscription?.unsubscribe();
        this.subscription = control && name ? this.service.watch(control, name, options) : undefined;
        this.trackedControl = control;
        this.trackedName = name;
        this.trackedOptions = options;
    }

    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
    }
}
