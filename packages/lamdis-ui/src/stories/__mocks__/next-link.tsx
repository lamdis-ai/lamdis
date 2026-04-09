import React from 'react';

const Link = ({
  href,
  children,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  [key: string]: any;
}) => (
  <a href={href} {...props}>
    {children}
  </a>
);

export default Link;
