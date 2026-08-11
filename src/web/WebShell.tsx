/**
 * The web application shell.
 *
 * Sibling to screens/Shell.tsx, not a replacement for it: the phone build keeps
 * that one (spec W3). Both mount the same routes so a link opens the right
 * thing on either device; only the frame around them differs.
 *
 * Layout is a fixed viewport with the scrolling inside it, not a scrolling
 * page. A back-office is a workspace: the sidebar and the table header stay put
 * while the rows move, which cannot be done if the document itself scrolls.
 */
import { Route, Router } from 'preact-iso'
import { AppBar } from './AppBar'
import { Sidebar } from './Sidebar'
import { TodayPage } from './TodayPage'
import { OrdersPage } from './OrdersPage'
import { ClientsPage } from './ClientsPage'
import { NotBuiltYet } from './NotBuiltYet'
import { ClientDetail } from '../screens/ClientDetail'
import { OrderDetail } from '../screens/OrderDetail'
import { OrderForm } from '../screens/OrderForm'
import { SaleForm } from '../screens/SaleForm'
import { ShopSettings } from '../screens/settings/ShopSettings'
import { MeasurementFieldSettings } from '../screens/settings/MeasurementFieldSettings'
import { StaffSettings } from '../screens/settings/StaffSettings'
import { BackupSettings } from '../screens/settings/BackupSettings'
import { NotFound } from '../screens/NotFound'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

/**
 * Screens the web design has not been drawn for yet fall back to the phone
 * screen inside this frame. It is not the finished answer, and it is better
 * than a dead route: the work still gets done while the design catches up.
 *
 * Listed explicitly rather than left implicit so the remaining work is legible
 * from one place.
 */
const BORROWED_FROM_PHONE = [
  { path: '/orders/new', component: OrderForm },
  { path: '/orders/:id', component: OrderDetail },
  { path: '/orders/:id/edit', component: OrderForm },
  { path: '/clients/:id', component: ClientDetail },
  { path: '/sales/new', component: SaleForm },
  { path: '/settings/shop', component: ShopSettings },
  { path: '/settings/measurements', component: MeasurementFieldSettings },
  { path: '/settings/staff', component: StaffSettings },
  { path: '/settings/backup', component: BackupSettings },
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
  return (
    <div class="flex h-svh flex-col overflow-hidden bg-page text-content">
      <AppBar />
      <div class="flex min-h-0 flex-1">
        <Sidebar online={online} auth={auth} replication={replication} />
        <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Router>
            <Route path="/" component={TodayPage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/clients" component={ClientsPage} />

            <Route path="/sales" component={() => <NotBuiltYet title="Sales" crumbs={['Money']} />} />
            <Route
              path="/expenses"
              component={() => <NotBuiltYet title="Expenses" crumbs={['Money']} />}
            />
            <Route
              path="/reports"
              component={() => <NotBuiltYet title="Reports" crumbs={['Money']} />}
            />
            <Route
              path="/settings"
              component={() => <NotBuiltYet title="Settings" crumbs={['Shop']} />}
            />

            {BORROWED_FROM_PHONE.map((route) => (
              <Route key={route.path} path={route.path} component={route.component} />
            ))}

            <Route default component={NotFound} />
          </Router>
        </main>
      </div>
    </div>
  )
}
