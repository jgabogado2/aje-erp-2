'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, Building2, Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useSites } from '@/hooks/use-sites';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function SiteSwitcher() {
  const { status } = useSession();
  const sitesQuery = useSites();
  const currentSiteId = useAppStore((s) => s.currentSiteId);
  const setCurrentSiteId = useAppStore((s) => s.setCurrentSiteId);

  const sites = (sitesQuery.data ?? []).filter((s) => s.is_active);
  const currentSite = sites.find((s) => s.id === currentSiteId) ?? null;

  // Default to the first accessible site once the data loads. Also clear a
  // stale selection if the previously-chosen site is no longer accessible.
  useEffect(() => {
    if (!sitesQuery.data) return;
    if (currentSiteId && !sites.find((s) => s.id === currentSiteId)) {
      setCurrentSiteId(sites[0]?.id ?? null);
      return;
    }
    if (!currentSiteId && sites.length > 0) {
      setCurrentSiteId(sites[0].id);
    }
  }, [sitesQuery.data, sites, currentSiteId, setCurrentSiteId]);

  if (status !== 'authenticated') return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 px-3"
          aria-label="Switch site"
          disabled={sitesQuery.isLoading}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Site
            </span>
            <span className="text-xs font-medium">
              {sitesQuery.isLoading
                ? 'Loading…'
                : currentSite
                  ? currentSite.name
                  : sites.length === 0
                    ? 'No sites'
                    : 'Select a site'}
            </span>
          </div>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your sites</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sites.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No sites assigned yet.
          </div>
        ) : (
          sites.map((site) => {
            const active = site.id === currentSiteId;
            return (
              <DropdownMenuItem
                key={site.id}
                onSelect={() => setCurrentSiteId(site.id)}
                className="flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{site.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {site.code}
                  </div>
                </div>
                {active && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/sites" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>Manage sites</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
