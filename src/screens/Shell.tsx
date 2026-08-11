/**
 * The authenticated app shell.
 *
 * A thin status strip, a scrolling screen area, and a fixed tab bar. The tab
 * bar is `fixed` rather than `sticky` so it survives the iOS URL bar
 * collapsing on scroll, which otherwise makes a sticky bar jump.
 *
 * The strip is suppressed on `/` (spec A10): Today grows its own profile
 * header carrying the same identity and sync state (A9), and repeating both
 * inches apart would be the exact duplication A2 already complained about.
 * Every other screen keeps the strip exactly as it was.
 *
 * ## Routing
 *
 * `preact-iso` with real history URLs rather than hash routing. The usual
 * objection -- a deep link 404s on refresh -- does not apply:
 * vite-plugin-pwa's generateSW mode sets `navigateFallback: 'index.html'` by
 * default, so the service worker answers every navigation from the precached
 * shell, offline included.
 */
import { Route, Router, useLocation } from 'preact-iso'
import { SideRail, TabBar } from '../components/TabBar'
import { SyncBadge } from '../components/SyncBadge'
import { Avatar, CONTAINER, cn } from '../components/ui'
import { IconSettings } from '../components/icons'
import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

import { Today } from './today/Today'
import { Clients } from './Clients'
import { ClientDetail } from './ClientDetail'
import { Orders } from './Orders'
import { OrderDetail } from './OrderDetail'
import { OrderForm } from './OrderForm'
import { Settings } from './Settings'
import { ShopSettings } from './settings/ShopSettings'
import { MeasurementFieldSettings } from './settings/MeasurementFieldSettings'
import { LockSettings } from './settings/LockSettings'
import { StaffSettings } from './settings/StaffSettings'
import { BackupSettings } from './settings/BackupSettings'
import { FeatureSettings } from './settings/FeatureSettings'
import { Catalogue } from './Catalogue'
import { CatalogueDetail } from './CatalogueDetail'
import { Suppliers } from './Suppliers'
import { Materials } from './Materials'
import { Inventory } from './Inventory'
import { InventoryItemDetail } from './InventoryItemDetail'
import { Production } from './Production'
import { ProductionBatchDetail } from './ProductionBatchDetail'
import { Collections } from './Collections'
import { GarmentUnits } from './GarmentUnits'
import { Money } from './Money'
import { Reports } from './Reports'
import { Sales } from './Sales'
import { SaleForm } from './SaleForm'
import { Expenses } from './Expenses'
import { NotFound } from './NotFound'

interface ShellProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export function Shell({ online, auth, replication }: ShellProps) {
  const { activeStaff } = useShop()
  const { path } = useLocation()

  return (
    <div class="min-h-svh bg-stone-100 lg:pl-60 dark:bg-stone-950">
      <SideRail online={online} auth={auth} replication={replication} />
      {/*
        Page-coloured and unbordered, so this and the Screen header below it read
        as one quiet block rather than two stacked bars. Nothing here is a
        surface; the first surface on any screen is its content.

        The safe-area padding always applies -- the notch does not go away just
        because Today has its own header -- but the row inside it only renders
        off Today, where it would otherwise repeat Today's profile header.
      */}
      <div class="safe-top">
        {path !== '/' && (
          // Hidden at lg: the rail carries the same identity and sync state,
          // permanently and on every screen including Today.
          <div class={cn(CONTAINER, 'flex items-center justify-between gap-3 px-4 pt-2.5 pb-1 lg:hidden')}>
            <SyncBadge online={online} auth={auth} replication={replication} />
            {/* One control, not two: the avatar says who is working, the gear says
                what tapping does, and both go to the same place. */}
            <a
              href="/settings"
              aria-label="Settings"
              class="-mr-2 flex min-h-9 items-center gap-2 rounded-control px-2
                     text-stone-500 transition-colors active:bg-stone-200
                     dark:text-stone-400 dark:active:bg-stone-800"
            >
              <IconSettings size={17} />
              {activeStaff && <Avatar name={activeStaff.name} size="sm" />}
            </a>
          </div>
        )}
      </div>

      <main>
        <Router>
          <Route path="/" component={Today} online={online} auth={auth} replication={replication} />
          <Route path="/clients" component={Clients} />
          <Route path="/clients/:id" component={ClientDetail} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/new" component={OrderForm} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/orders/:id/edit" component={OrderForm} />
          <Route path="/money" component={Money} />
          <Route path="/reports" component={Reports} />
          <Route path="/sales" component={Sales} />
          <Route path="/sales/new" component={SaleForm} />
          <Route path="/expenses" component={Expenses} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/shop" component={ShopSettings} />
          <Route path="/settings/measurements" component={MeasurementFieldSettings} />
          <Route path="/settings/lock" component={LockSettings} />
          <Route path="/settings/staff" component={StaffSettings} />
          <Route path="/settings/backup" component={BackupSettings} />
          <Route path="/settings/features" component={FeatureSettings} />
          <Route path="/catalogue" component={Catalogue} />
          <Route path="/catalogue/:id" component={CatalogueDetail} />
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/materials" component={Materials} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/inventory/:id" component={InventoryItemDetail} />
          <Route path="/production" component={Production} />
          <Route path="/production/:id" component={ProductionBatchDetail} />
          <Route path="/collections" component={Collections} />
          <Route path="/garment-units" component={GarmentUnits} />
          <Route default component={NotFound} />
        </Router>
      </main>

      <TabBar />
    </div>
  )
}
