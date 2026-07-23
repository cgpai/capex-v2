import React from 'react';

export type ExternalLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

/**
 * External URLs only (mailto:, https:, wa.me, …).
 * Internal app routes: use router.push / pageToHref — not this component.
 */
export const ExternalLink = React.forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  function ExternalLink(
    { href, target = '_blank', rel = 'noopener noreferrer', children, ...props },
    ref,
  ) {
    return (
      <a ref={ref} href={href} target={target} rel={rel} {...props}>
        {children}
      </a>
    );
  },
);

ExternalLink.displayName = 'ExternalLink';
