import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import postcardUrl from '../assets/hitchin-postcard.svg';

// Big, high-contrast controls for one-handed use outdoors.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary';
};

export const Button = ({ busy, variant = 'primary', disabled, children, ...rest }: ButtonProps) => (
  <button
    {...rest}
    disabled={disabled || busy}
    aria-busy={busy}
    className={`w-full rounded-2xl px-6 py-4 text-xl font-semibold disabled:opacity-50 ${
      variant === 'primary'
        ? 'bg-amber-400 text-slate-900 active:bg-amber-300'
        : 'border-2 border-slate-500 text-white active:bg-slate-800'
    }`}
  >
    {busy ? 'Please wait…' : children}
  </button>
);

export const TextField = ({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="flex flex-col gap-2 text-left text-lg">
    {label}
    <input
      {...rest}
      className="rounded-xl border-2 border-slate-500 bg-slate-800 px-4 py-3 text-xl text-white focus:border-amber-400 focus:outline-none"
    />
  </label>
);

export const ErrorMessage = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="rounded-xl bg-red-900 px-4 py-3 text-lg text-white">
      {children}
    </p>
  ) : null;

const APP_NAME = 'Hitchin Treasure Hunt';

/** The "Greetings from Hitchin" postcard. Without a title it is the page heading itself. */
const Postcard = ({ asHeading }: { asHeading: boolean }) => {
  const img = (
    <img
      src={postcardUrl}
      alt={asHeading ? APP_NAME : ''}
      width={600}
      height={420}
      className="h-auto w-full drop-shadow-lg"
    />
  );
  return asHeading ? <h1>{img}</h1> : img;
};

/** `logo` shows the postcard at the top; leave out `title` when the postcard is the heading. */
export const Screen = ({
  title,
  logo,
  children,
}: {
  title?: string;
  logo?: boolean;
  children: ReactNode;
}) => (
  <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 bg-slate-900 px-5 py-8 text-white">
    {logo && <Postcard asHeading={!title} />}
    {title && <h1 className="text-center text-3xl font-bold">{title}</h1>}
    {children}
  </main>
);

export const LinkButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="py-3 text-lg text-amber-300 underline">
    {children}
  </button>
);

/** An image that disappears instead of showing a broken icon if it can't load (e.g. no signal). */
export const SafeImage = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) => {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (failedSrc === src) return null;
  return <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />;
};
