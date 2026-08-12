import Link from 'next/link';
import { shop, whatsappLink } from '../../lib/shop.js';
import { FEATURED_CATEGORIES } from '../../lib/categories.js';
import Icon from '../ui/Icon.jsx';

const CONTACT = [
  { icon: 'whatsapp', value: shop.phone, href: whatsappLink(), label: 'WhatsApp' },
  { icon: 'phone', value: shop.phone, href: `tel:${shop.phone.replace(/\s/g, '')}`, label: 'Phone' },
  { icon: 'mail', value: shop.email, href: `mailto:${shop.email}`, label: 'Email' },
  { icon: 'pin', value: shop.address, href: null, label: 'Address' },
];

export default function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-ink text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_85%_0%,rgba(47,91,255,0.22)_0%,transparent_60%)]"
      />

      <div className="container-page relative">
        {/* Closing call to action: the storefront's whole job is to end in a
            conversation, so the footer opens with one. */}
        <div className="flex flex-col gap-6 border-b border-white/10 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="display text-2xl sm:text-3xl">Found what you need?</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55">
              Message us and we&apos;ll confirm stock, hold it for you and arrange pickup. No
              account, no checkout.
            </p>
          </div>
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent shrink-0"
          >
            <Icon name="whatsapp" className="h-4 w-4" />
            Message ByteHub
          </a>
        </div>

        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
                <Icon name="bolt" className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span className="display text-lg text-white">{shop.name}</span>
            </span>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">{shop.tagline}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">Shop</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/products" className="text-sm text-white/55 transition-colors hover:text-white">
                  All products
                </Link>
              </li>
              {FEATURED_CATEGORIES.map((category) => (
                <li key={category.name}>
                  <Link
                    href={`/products?category=${encodeURIComponent(category.name)}`}
                    className="text-sm text-white/55 transition-colors hover:text-white"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">Contact</h3>
            <ul className="mt-4 space-y-3">
              {CONTACT.map((entry) => (
                <li key={entry.label} className="flex items-start gap-2.5">
                  <Icon name={entry.icon} className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
                  {entry.href ? (
                    <a
                      href={entry.href}
                      target={entry.href.startsWith('http') ? '_blank' : undefined}
                      rel={entry.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="text-sm text-white/55 transition-colors hover:text-white"
                    >
                      {entry.value}
                    </a>
                  ) : (
                    <span className="text-sm text-white/55">{entry.value}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/35">
            © {new Date().getFullYear()} {shop.name}. All prices in Egyptian pounds.
          </p>
          <p className="text-xs text-white/35">
            Prices and availability may change — please confirm before travelling.
          </p>
        </div>
      </div>
    </footer>
  );
}
