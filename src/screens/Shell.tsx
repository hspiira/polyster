/* Status strip, scrolling screens, a fixed tab bar (fixed, so the iOS URL bar
   cannot make it jump). Real history URLs: the service worker answers refreshes. */
import { useEffect } from 'preact/hooks'
import { ErrorBoundary, Route, Router, lazy, useLocation } from 'preact-iso'
import { SideRail, TabBar } from '../components/TabBar'
import { SyncBadge } from '../components/SyncBadge'
import { MEASURE, cn } from '../ui'
import { IconSettings } from '../components/icons'
import { recordVisit } from '../lib/navigation'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../lib/syncState'

import { Today } from './today/Today'

// Route-level code splitting, so the entry chunk carries the shell and one
// screen, not all 29. Today stays eager -- a lazy boundary there would flash.
const Clients = lazy(() => import('./Clients').then((m) => m.Clients))
const ClientDetail = lazy(() => import('./ClientDetail').then((m) => m.ClientDetail))
const Orders = lazy(() => import('./Orders').then((m) => m.Orders))
const OrderDetail = lazy(() => import('./OrderDetail').then((m) => m.OrderDetail))
const OrderForm = lazy(() => import('./OrderForm').then((m) => m.OrderForm))
const Settings = lazy(() => import('./Settings').then((m) => m.Settings))
const ShopSettings = lazy(() => import('./settings/ShopSettings').then((m) => m.ShopSettings))
const MeasurementFieldSettings = lazy(() => import('./settings/MeasurementFieldSettings').then((m) => m.MeasurementFieldSettings))
const LockSettings = lazy(() => import('./settings/LockSettings').then((m) => m.LockSettings))
const StaffSettings = lazy(() => import('./settings/StaffSettings').then((m) => m.StaffSettings))
const BackupSettings = lazy(() => import('./settings/BackupSettings').then((m) => m.BackupSettings))
const FeatureSettings = lazy(() => import('./settings/FeatureSettings').then((m) => m.FeatureSettings))
const Catalogue = lazy(() => import('./Catalogue').then((m) => m.Catalogue))
const CatalogueDetail = lazy(() => import('./CatalogueDetail').then((m) => m.CatalogueDetail))
const Suppliers = lazy(() => import('./Suppliers').then((m) => m.Suppliers))
const Materials = lazy(() => import('./Materials').then((m) => m.Materials))
const Inventory = lazy(() => import('./Inventory').then((m) => m.Inventory))
const InventoryItemDetail = lazy(() => import('./InventoryItemDetail').then((m) => m.InventoryItemDetail))
const Production = lazy(() => import('./Production').then((m) => m.Production))
const ProductionBatchDetail = lazy(() => import('./ProductionBatchDetail').then((m) => m.ProductionBatchDetail))
const Collections = lazy(() => import('./Collections').then((m) => m.Collections))
const GarmentUnits = lazy(() => import('./GarmentUnits').then((m) => m.GarmentUnits))
const AdvancedReports = lazy(() => import('./AdvancedReports').then((m) => m.AdvancedReports))
const Money = lazy(() => import('./Money').then((m) => m.Money))
const Reports = lazy(() => import('./Reports').then((m) => m.Reports))
const Sales = lazy(() => import('./Sales').then((m) => m.Sales))
const SaleForm = lazy(() => import('./SaleForm').then((m) => m.SaleForm))
const Expenses = lazy(() => import('./Expenses').then((m) => m.Expenses))
const NotFound = lazy(() => import('./NotFound').then((m) => m.NotFound))

interface ShellProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
  pending: number
}

export function Shell({ online, auth, replication, pending }: ShellProps) {
  const { path } = useLocation()

  // Feeds useBackTo: a screen with two parents points back at the one you
  // actually came from.
  useEffect(() => {
    recordVisit(path)
  }, [path])

  return (
    <div class="min-h-svh bg-page lg:pl-60">
      <SideRail online={online} auth={auth} replication={replication} pending={pending} />
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
          <div class={cn(MEASURE, 'flex items-center justify-between gap-3 px-4 pt-2.5 pb-1 lg:hidden')}>
            <SyncBadge online={online} auth={auth} replication={replication} pending={pending} />
            {/* A gear beside an avatar read as two controls -- a theme toggle
                that did nothing, and a profile that opened Settings. One
                button, and it looks like what it opens. */}
            <a
              href="/settings"
              aria-label="Settings"
              class="-mr-2 flex min-h-9 items-center rounded-control px-2
                     text-content-muted transition-colors active:bg-pressed"
            >
              <IconSettings size={20} />
            </a>
          </div>
        )}
      </div>

      <main>
        <ErrorBoundary>
          <Router>
            <Route path="/" component={Today} online={online} auth={auth} replication={replication} pending={pending} />
            <Route path="/clients" component={Clients} />
            <Route path="/clients/:id" component={ClientDetail} />
            <Route path="/orders" component={Orders} />
            <Route path="/orders/new" component={OrderForm} />
            <Route path="/orders/:id" component={OrderDetail} />
            <Route path="/orders/:id/edit" component={OrderForm} />
            <Route path="/money" component={Money} />
            <Route path="/reports" component={Reports} />
            <Route path="/reports/advanced" component={AdvancedReports} />
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
        </ErrorBoundary>
      </main>

      <TabBar />
    </div>
  )
}
