import { useEffect, useState } from "react";
import { Bell, Search, LogOut, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Topbar() {
  const { t, lang, setLang } = useI18n();
  const { user, signOut } = useAuth();
  const { branches, currentBranchId, setCurrentBranchId } = useBranch();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", { hour12: true });
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <header className="h-16 shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-border bg-card">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder={t("search")} className="ps-9 bg-muted/50 border-transparent focus-visible:bg-background" />
      </div>

      <div className="hidden sm:block text-sm font-mono tabular-nums text-muted-foreground">
        {time}
      </div>

      <Select value={currentBranchId ?? undefined} onValueChange={setCurrentBranchId}>
        <SelectTrigger className="w-[160px] hidden sm:flex">
          <SelectValue placeholder={t("branch")} />
        </SelectTrigger>
        <SelectContent>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="icon" onClick={() => setLang(lang === "ar" ? "en" : "ar")} title="Language">
        <Globe className="size-5" />
        <span className="sr-only">Language</span>
      </Button>

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="size-5" />
        <Badge className="absolute -top-1 -end-1 h-5 min-w-5 px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
          99+
        </Badge>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full hover:bg-muted px-1 py-1">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="me-2 size-4" /> {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}