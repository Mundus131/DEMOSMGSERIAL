'use client';

import '@synergy-design-system/components';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const pages = {
  '/dashboard': {
    title: 'Panel operatora',
    description: 'Start i stop zaladunku, numer partii, odczyty RFID i status wysylki RS.',
  },
  '/configuration': {
    title: 'Konfiguracja systemu',
    description: 'Ustawienia polaczen TCP/IP, glowicy RFID, CDF, FTP i parametrow odczytu.',
  },
  '/rs': {
    title: 'Konfiguracja RS',
    description: 'Wykryty system, dostepne porty szeregowe i parametry wysylki RS.',
  },
  '/rfid': {
    title: 'Monitor RFID',
    description: 'Podglad ostatnich cykli odczytu oraz biezacego stanu glowicy RFID.',
  },
};

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/configuration', label: 'Konfiguracja', icon: 'settings' },
  { href: '/rs', label: 'RS Config', icon: 'settings_ethernet' },
  { href: '/rfid', label: 'RFID Monitor', icon: 'sensors' },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const headerRef = useRef(null);
  const sideNavRef = useRef(null);
  const contentInnerRef = useRef(null);
  const menuRef = useRef(null);
  const currentPage = pages[pathname] || pages['/dashboard'];

  useEffect(() => {
    const header = headerRef.current;
    const sideNav = sideNavRef.current;
    const contentInner = contentInnerRef.current;
    const menu = menuRef.current;

    if (!header) return;

    if (sideNav && typeof header.connectSideNavigation === 'function') {
      header.connectSideNavigation(sideNav);
    } else {
      header.burgerMenu = 'hidden';
    }

    if (!sideNav || !contentInner) return;

    const syncOpen = () => {
      contentInner.style.marginLeft = 'var(--appshell-shrink-nav-open-width)';
    };

    const syncClosed = () => {
      contentInner.style.marginLeft = '0px';
    };

    if (sideNav.hasAttribute('open')) {
      syncOpen();
    } else {
      syncClosed();
    }

    const handleSideNavClick = (event) => {
      const item = event.target.closest('syn-nav-item');
      if (!item) return;
      const href = item.getAttribute('data-href');
      if (href) {
        router.push(href);
      }
    };

    const handleMenuClick = (event) => {
      const item = event.target.closest('syn-menu-item');
      if (!item) return;
      const href = item.getAttribute('data-href');
      const action = item.getAttribute('data-action');
      if (href) {
        router.push(href);
      } else if (action === 'toggle-theme') {
        document.body.classList.toggle('industrial');
      }
    };

    sideNav.addEventListener('syn-show', syncOpen);
    sideNav.addEventListener('syn-hide', syncClosed);
    sideNav.addEventListener('click', handleSideNavClick);
    menu?.addEventListener('click', handleMenuClick);

    return () => {
      sideNav.removeEventListener('syn-show', syncOpen);
      sideNav.removeEventListener('syn-hide', syncClosed);
      sideNav.removeEventListener('click', handleSideNavClick);
      menu?.removeEventListener('click', handleMenuClick);
    };
  }, [router]);

  useEffect(() => {
    const sideNav = sideNavRef.current;
    const contentInner = contentInnerRef.current;
    if (!sideNav || !contentInner) return;

    if (typeof sideNav.hide === 'function') {
      sideNav.hide();
    } else {
      sideNav.removeAttribute('open');
    }
    contentInner.style.marginLeft = '0px';
  }, [pathname]);

  return (
    <div className="synergy-demo-application" id="appshell-shrink">
      <syn-header ref={headerRef} label="Samsung RFID Ident Gate">
        <nav slot="meta-navigation" className="shell-meta">
          <span className="shell-current-page">{currentPage.title}</span>
          <syn-dropdown>
            <syn-icon-button
              color="neutral"
              name="more_vert"
              label="More"
              slot="trigger"
            ></syn-icon-button>
            <syn-menu ref={menuRef}>
              <syn-menu-item data-href="/dashboard">Dashboard</syn-menu-item>
              <syn-menu-item data-href="/configuration">Konfiguracja</syn-menu-item>
              <syn-menu-item data-href="/rs">RS Config</syn-menu-item>
              <syn-menu-item data-href="/rfid">RFID</syn-menu-item>
              <syn-menu-item data-action="toggle-theme">Toggle theme</syn-menu-item>
            </syn-menu>
          </syn-dropdown>
        </nav>
      </syn-header>

      <div className="synergy-demo-content">
        <syn-side-nav ref={sideNavRef} variant="default" no-focus-trapping="">
          {navItems.map((item, index) => (
            <syn-nav-item
              key={item.href}
              data-href={item.href}
              current={pathname === item.href ? '' : undefined}
              divider={index > 0 ? '' : undefined}
            >
              <syn-icon name={item.icon} slot="prefix"></syn-icon>
              {item.href === '/dashboard' ? 'Start' : item.label}
            </syn-nav-item>
          ))}
          <syn-nav-item slot="footer" data-href="/configuration">
            <syn-icon name="settings" slot="prefix"></syn-icon>
            Settings
          </syn-nav-item>
          <syn-nav-item slot="footer" divider="" data-href="/dashboard">
            <syn-icon name="logout" slot="prefix"></syn-icon>
            Logout
          </syn-nav-item>
        </syn-side-nav>

        <div className="synergy-demo-content-inner" ref={contentInnerRef}>
          <main className="synergy-demo-main shell-main">
            {children}
          </main>

          <footer className="synergy-footer-demo shell-footer">
            <nav className="footer-content" aria-label="Footer navigation">
              <ul className="syn-link-list syn-link-list--small syn-link-list--horizontal">
                <li><a className="syn-link syn-link--small syn-link--quiet" href="https://www.sick.com/imprint">Imprint</a></li>
                <li><a className="syn-link syn-link--small syn-link--quiet" href="https://www.sick.com/tac">Terms and conditions</a></li>
                <li><a className="syn-link syn-link--small syn-link--quiet" href="https://www.sick.com/terms-of-use">Terms of use</a></li>
                <li><a className="syn-link syn-link--small syn-link--quiet" href="https://www.sick.com/dataprotection">Privacy Policy</a></li>
              </ul>
              <p className="copyright">© 2026 SICK AG</p>
            </nav>
          </footer>
        </div>
      </div>
    </div>
  );
}
