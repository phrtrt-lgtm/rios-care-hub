import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvatarUpload } from "@/components/AvatarUpload";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationButton } from "@/components/NotificationButton";
import { UnifiedCalendarWidget } from "@/components/UnifiedCalendarWidget";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface AcaoHeader {
  rotulo: string;
  icone: ReactNode;
  onClick: () => void;
}

interface Props {
  /** Para onde o logo leva. */
  inicio: string;
  /** Botão principal, só em desktop (no celular fica no MobileBottomNav). */
  acaoPrincipal?: AcaoHeader;
  /** Itens do menu "Mais", só em desktop. Já filtrados por papel. */
  maisAcoes?: AcaoHeader[];
  /** Abre a busca global (⌘K). */
  onBuscar?: () => void;
  mostrarCalendario?: boolean;
  /** Botões extras dentro do diálogo de perfil, antes de "Sair". */
  extrasPerfil?: ReactNode;
}

/**
 * Barra superior das páginas de painel (equipe e proprietário).
 *
 * Fixa no topo, com fundo translúcido. À esquerda: logo, ação principal e
 * menu "Mais". À direita: busca, calendário, notificações e perfil.
 * O diálogo de perfil (foto, dados, senha, sair) mora aqui, para as duas
 * páginas não repetirem o mesmo bloco.
 */
export function PainelHeader({
  inicio,
  acaoPrincipal,
  maisAcoes = [],
  onBuscar,
  mostrarCalendario = false,
  extrasPerfil,
}: Props) {
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url);

  const inicial = profile?.name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="safe-area-top sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(inicio)}
            className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Início"
          >
            <img src="/logo.png" alt="RIOS" className="h-6 object-contain" />
          </button>

          {acaoPrincipal && (
            <Button size="sm" className="hidden h-9 sm:inline-flex" onClick={acaoPrincipal.onClick}>
              <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                {acaoPrincipal.icone}
              </span>
              {acaoPrincipal.rotulo}
            </Button>
          )}

          {maisAcoes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex">
                  <MoreHorizontal className="h-4 w-4" />
                  Mais
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 bg-popover">
                {maisAcoes.map((a) => (
                  <DropdownMenuItem key={a.rotulo} onClick={a.onClick} className="gap-2">
                    <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                      {a.icone}
                    </span>
                    {a.rotulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {onBuscar && (
            <>
              <Button
                variant="outline"
                className="hidden h-9 items-center gap-2 pr-1.5 text-muted-foreground sm:flex"
                onClick={onBuscar}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm font-normal">Buscar</span>
                <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  ⌘K
                </kbd>
              </Button>
              <Button variant="ghost" size="icon" className="sm:hidden" onClick={onBuscar} aria-label="Buscar">
                <Search className="h-5 w-5" />
              </Button>
            </>
          )}

          {mostrarCalendario && <UnifiedCalendarWidget />}

          <NotificationButton />

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Meu perfil"
                className={cn(
                  "ml-0.5 flex h-9 items-center gap-2 rounded-full border border-border/70 bg-card py-1 pl-1 pr-1.5 text-sm transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-2.5",
                )}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {inicial}
                  </span>
                )}
                <span className="hidden max-w-[140px] truncate font-medium sm:inline">{profile?.name}</span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden="true" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-xs sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base">Meu perfil</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <AvatarUpload
                  userId={user?.id || ""}
                  currentPhotoUrl={photoUrl}
                  userName={profile?.name || "Usuário"}
                  onUploadComplete={(url) => setPhotoUrl(url)}
                />

                <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
                  <CampoPerfil rotulo="Nome" valor={profile?.name} />
                  <CampoPerfil rotulo="E-mail" valor={profile?.email} />
                  <CampoPerfil rotulo="Telefone" valor={profile?.phone || "Não informado"} />
                </dl>

                <div className="space-y-2">
                  <ChangePasswordDialog />
                  {extrasPerfil}
                  <Button
                    variant="outline"
                    onClick={signOut}
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}

function CampoPerfil({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right">{valor || "—"}</dd>
    </div>
  );
}
