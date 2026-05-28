<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'secondary' | 'outline';

  interface Props {
    variant?: Variant;
    class?: string;
    style?: string;
    children: Snippet;
  }

  let { variant = 'default', class: cls = '', style = '', children }: Props = $props();

  const base = 'inline-flex items-center rounded-[var(--radius-pill)] font-sans font-medium leading-snug whitespace-nowrap px-2 py-[3px] text-[11px]';

  const variants: Record<Variant, string> = {
    default:   'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    outline:   'border border-border bg-transparent text-foreground',
  };
</script>

<span class={cn(base, variants[variant], cls)} {style}>
  {@render children()}
</span>
