import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, BarChart2, Landmark, FolderOpen,
  ShieldAlert, LogOut, Receipt, CalendarRange,
} from "lucide-react";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { path: "/",                label: "Dashboard",         icon: LayoutDashboard, iconColor: "text-primary" },
  { path: "/working-capital", label: "Working Capital",   icon: BarChart2,       iconColor: "text-[#4A9EFF]" },
  { path: "/banking-analysis",label: "Banking Analysis",  icon: Landmark,        iconColor: "text-[#F5C842]" },
  { path: "/gst-itr",         label: "GST & ITR",         icon: Receipt,         iconColor: "text-[#A855F7]" },
  { path: "/multi-year",      label: "Multi-Year",        icon: CalendarRange,   iconColor: "text-[#10B981]" },
  { path: "/storage",         label: "Saved CAM Files",   icon: FolderOpen,      iconColor: "text-[#F5832A]" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border/50 bg-sidebar flex flex-col z-20">
        <div className="h-20 flex items-center px-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="font-display font-bold text-lg text-primary-foreground">D</span>
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-none tracking-wide text-foreground">Dhanush</h1>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Enterprises</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path} className="block relative">
                <div className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 group
                  ${isActive
                    ? "bg-white/8 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}
                `}>
                  <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${item.iconColor} ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                  <span className="text-sm">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 w-1 h-8 bg-primary rounded-r-full"
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-4 py-3 text-muted-foreground rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Sign Out</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />

        <header className="h-20 flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-md flex items-center justify-between px-8 z-10 sticky top-0">
          <div>
            <h2 className="font-display font-semibold text-xl capitalize">
              {NAV_ITEMS.find((n) => n.path === location)?.label || "Dashboard"}
            </h2>
            <p className="text-[11px] text-muted-foreground font-medium tracking-wide">DHANUSH ENTERPRISES</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-1.5 rounded-full border border-warning/30 bg-warning/10 text-warning text-xs font-medium flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" /> Offline Mode Active
            </div>
            <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center cursor-pointer">
              <span className="text-sm font-medium">AD</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 z-10 relative">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
