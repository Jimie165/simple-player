import clsx from 'clsx';
import { IoEllipsisHorizontal } from 'react-icons/io5';

export default function MoreIcon({ className }: { className?: string }) {
    return <IoEllipsisHorizontal aria-hidden="true" className={clsx('size-5 shrink-0', className)} />;
}
