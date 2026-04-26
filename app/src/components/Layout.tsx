import { Link, NavLink, Outlet } from "react-router-dom";
import { Bird, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Bird, label: "Ask A Bird" },
  { to: "/optimize", icon: Target, label: "Find a Spot" },
  { to: "/our-story", icon: Sparkles, label: "Our Story" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[image:var(--gradient-sunset)] text-primary-foreground shadow-[var(--shadow-warm)]">
              <Bird className="h-5 w-5" />
            </span>
            <span>AskABird</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

        </div>

        {/* Mobile nav */}
        <nav className="md:hidden flex items-center justify-around border-t border-border bg-card/80">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 px-4 text-xs",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <p>What would a bird think? 🐦 AskABird | Built for the Sonoran desert.</p>
        <p>Bird data powered by <a href="https://ebird.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">eBird</a> · Conversation powered by Gemma 4</p>
      </footer>
    </div>
  );
}
