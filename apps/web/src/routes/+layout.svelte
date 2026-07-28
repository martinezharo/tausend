<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { children } = $props();

  const nav = [
    { href: '/', label: 'Deckung' },
    { href: '/woerter', label: 'Wörter' },
    { href: '/geschichten', label: 'Texte' }
  ];

  // The session runs full-bleed: no chrome competing with the exercise.
  const bare = $derived(page.url.pathname.startsWith('/learn'));
</script>

{#if !bare}
  <header>
    <div class="wrap bar">
      <a href="/" class="brand" aria-label="Tausend, home">
        <span class="logo">1000</span>
        <span class="mono sub">Wortschatz DE&thinsp;→&thinsp;EN</span>
      </a>
      <nav>
        {#each nav as item (item.href)}
          <a
            class="mono tab"
            href={item.href}
            aria-current={page.url.pathname === item.href ? 'page' : undefined}>{item.label}</a
          >
        {/each}
      </nav>
    </div>
  </header>
{/if}

<main class:bare>
  {@render children()}
</main>

{#if !bare}
  <footer>
    <div class="wrap foot mono">
      <span>Frequenz: OpenSubtitles · CC BY-SA</span>
      <a href="/ueber">Über</a>
    </div>
  </footer>
{/if}

<style>
  header {
    border-bottom: 1px solid var(--linie-stark);
    position: sticky;
    top: 0;
    background: var(--beton);
    z-index: 10;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
  .brand {
    text-decoration: none;
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  .logo {
    font-variation-settings: 'wdth' 70, 'wght' 900;
    font-size: 22px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .sub {
    color: var(--grau);
    white-space: nowrap;
  }
  @media (max-width: 460px) {
    .sub {
      display: none;
    }
  }
  nav {
    display: flex;
    gap: 2px;
  }
  .tab {
    text-decoration: none;
    color: var(--grau);
    padding: 8px 10px;
    border: 1px solid transparent;
  }
  .tab[aria-current='page'] {
    color: var(--tinte);
    border-color: var(--linie-stark);
  }
  main {
    flex: 1;
    padding-bottom: 40px;
  }
  main.bare {
    padding-bottom: 0;
  }
  footer {
    border-top: 1px solid var(--linie-stark);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding-top: 14px;
    padding-bottom: 24px;
    color: var(--grau);
  }
</style>
