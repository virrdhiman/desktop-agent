import fullLogo from '../assets/pit-logo.png'
import markLogo from '../assets/pit-logo-trimmed.png'

type BrandLogoProps = {
  variant?: 'full' | 'mark'
  className?: string
  alt?: string
}

/** The supplied Productive IT bitmap is the only brand artwork used by the app. */
export default function BrandLogo({ variant = 'full', className = '', alt = 'Productive IT' }: BrandLogoProps) {
  return (
    <img
      className={`vd-brand-logo vd-brand-logo-${variant} ${className}`.trim()}
      src={variant === 'mark' ? markLogo : fullLogo}
      alt={alt}
      draggable={false}
    />
  )
}
