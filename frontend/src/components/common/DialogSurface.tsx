import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { DialogPanel as HeadlessPanel, DialogBackdrop as HeadlessBackdrop } from '@headlessui/react';
import '@/components/common/DialogSurface.css';

export const DialogPanel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof HeadlessPanel>>(
    function DialogPanel({ className = '', ...props }, ref) {
        return <HeadlessPanel {...props} ref={ref} className={`app-dialog-panel ${className}`} />;
    },
);

export const DialogBackdrop = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof HeadlessBackdrop>>(
    function DialogBackdrop({ className = '', ...props }, ref) {
        return <HeadlessBackdrop {...props} ref={ref} className={`app-dialog-backdrop ${className}`} />;
    },
);
