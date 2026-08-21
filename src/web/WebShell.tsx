/* Sibling to screens/Shell.tsx, not a replacement (W3); both mount the same
   routes. A fixed viewport scrolling inside, so the sidebar and header stay put. */
import { ErrorBoundary, Route, Router, lazy, useLocation } from 'preact-iso'
import { useCallback, useState } from 'preact/hooks'
import { AppBar } from './AppBar'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { useShortcuts } from './useShortcuts'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../lib/syncState'

const TodayPage = lazy(() => import('./TodayPage').then((m) => m.TodayPage))
const OrdersPage = lazy(() => import('./OrdersPage').then((m) => m.OrdersPage))
const ClientsPage = lazy(() => import('./ClientsPage').then((m) => m.ClientsPage))
const ClientDetailPage = lazy(() => import('./ClientDetailPage').then((m) => m.ClientDetailPage))
const SalesPage = lazy(() => import('./SalesPage').then((m) => m.SalesPage))
const ExpensesPage = lazy(() => import('./ExpensesPage').then((m) => m.ExpensesPage))
const ReportsPage = lazy(() => import('./ReportsPage').then((m) => m.ReportsPage))
const OrderDetail = lazy(() => import('../screens/OrderDetail').then((m) => m.OrderDetail))
const OrderForm = lazy(() => import('../screens/OrderForm').then((m) => m.OrderForm))
const SaleForm = lazy(() => import('../screens/SaleForm').then((m) => m.SaleForm))
const Settings = lazy(() => import('../screens/Settings').then((m) => m.Settings))
const ShopSettings = lazy(() => import('../screens/settings/ShopSettings').then((m) => m.ShopSettings))
const MeasurementFieldSettings = lazy(() => import('../screens/settings/MeasurementFieldSettings').then((m) => m.MeasurementFieldSettings))
const LockSettings = lazy(() => import('../screens/settings/LockSettings').then((m) => m.LockSettings))
const StaffSettings = lazy(() => import('../screens/settings/StaffSettings').then((m) => m.StaffSettings))
const BackupSettings = lazy(() => import('../screens/settings/BackupSettings').then((m) => m.BackupSettings))
const FeatureSettings = lazy(() => import('../screens/settings/FeatureSettings').then((m) => m.FeatureSettings))
const Catalogue = lazy(() => import('../screens/Catalogue').then((m) => m.Catalogue))
const CatalogueDetail = lazy(() => import('../screens/CatalogueDetail').then((m) => m.CatalogueDetail))
const Suppliers = lazy(() => import('../screens/Suppliers').then((m) => m.Suppliers))
const Materials = lazy(() => import('../screens/Materials').then((m) => m.Materials))
const Inventory = lazy(() => import('../screens/Inventory').then((m) => m.Inventory))
const InventoryItemDetail = lazy(() => import('../screens/InventoryItemDetail').then((m) => m.InventoryItemDetail))
const Production = lazy(() => import('../screens/Production').then((m) => m.Production))
const ProductionBatchDetail = lazy(() => import('../screens/ProductionBatchDetail').then((m) => m.ProductionBatchDetail))
const Collections = lazy(() => import('../screens/Collections').then((m) => m.Collections))
const GarmentUnits = lazy(() => import('../screens/GarmentUnits').then((m) => m.GarmentUnits))
const AdvancedReports = lazy(() => import('../screens/AdvancedReports').then((m) => m.AdvancedReports))
const NotFound = lazy(() => import('../screens/NotFound').then((m) => m.NotFound))

/* Screens the web design has not been drawn for fall back to the phone one
   inside this frame. Listed explicitly, so the remaining work is legible. */
const BORROWED_FROM_PHONE = [
  { path: '/orders/new', component: OrderForm },
  { path: '/orders/:id', component: OrderDetail },
  { path: '/orders/:id/edit', component: OrderForm },
  { path: '/sales/new', component: SaleForm },
  { path: '/settings', component: Settings },
  { path: '/settings/shop', component: ShopSettings },
  { path: '/settings/measurements', component: MeasurementFieldSettings },
  { path: '/settings/lock', component: LockSettings },
  { path: '/settings/staff', component: StaffSettings },
  { path: '/settings/backup', component: BackupSettings },
  { path: '/settings/features', component: FeatureSettings },
  { path: '/catalogue', component: Catalogue },
  { path: '/catalogue/:id', component: CatalogueDetail },
  { path: '/suppliers', component: Suppliers },
  { path: '/materials', component: Materials },
  { path: '/inventory', component: Inventory },
  { path: '/inventory/:id', component: InventoryItemDetail },
  { path: '/production', component: Production },
  { path: '/production/:id', component: ProductionBatchDetail },
  { path: '/collections', component: Collections },
  { path: '/garment-units', component: GarmentUnits },
  { path: '/reports/advanced', component: AdvancedReports },
] as const

export function WebShell({
  online,
  auth,
  replication,
}: {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const location = useLocation()
  const [searching, setSearching] = useState(false)

  // Registered here, once, so a shortcut cannot mean two things on two screens.
  useShortcuts({
    onSearch: useCallback(() => setSearching(true), []),
    onNew: useCallback(() => location.route('/orders/new'), [location]),
    onEscape: useCallback(() => setSearching(false), []),
  })

  return (
    <div class="flex h-svh flex-col overflow-hidden bg-page text-content">
      <AppBar onSearch={() => setSearching(true)} />
      <div class="flex min-h-0 flex-1">
        <Sidebar online={online} auth={auth} replication={replication} />
        <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            <Router>
            <Route path="/" component={TodayPage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/clients" component={ClientsPage} />
            <Route path="/clients/:id" component={ClientDetailPage} />

            <Route path="/sales" component={SalesPage} />
            <Route path="/expenses" component={ExpensesPage} />
            <Route path="/reports" component={ReportsPage} />

            {BORROWED_FROM_PHONE.map((route) => (
              <Route key={route.path} path={route.path} component={route.component} />
            ))}

            <Route default component={NotFound} />
            </Router>
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </div>
  )
}
