import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { goBack } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Search, UserCheck, UserX, Trash2, CheckSquare, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
};

type BulkAction = "approve" | "reject" | "delete" | null;

export default function AdminGerenciarUsuarios() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  
  // Bulk selection state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, statusFilter]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedUsers(new Set());
  }, [searchTerm, roleFilter, statusFilter]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((user) => user.status === statusFilter);
    }

    // Sort alphabetically by name within each group
    filtered.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    setFilteredUsers(filtered);
  };

  const roleOrder: Record<string, number> = {
    admin: 0,
    agent: 1,
    maintenance: 2,
    owner: 3,
    pending_owner: 4,
    cleaner: 5,
  };

  const roleLabels: Record<string, string> = {
    admin: "Administradores",
    agent: "Atendentes",
    maintenance: "Manutenção",
    owner: "Proprietários",
    pending_owner: "Proprietários Pendentes",
    cleaner: "Faxineiras",
  };

  const groupedUsers = filteredUsers.reduce<Record<string, UserProfile[]>>((acc, user) => {
    const role = user.role;
    if (!acc[role]) acc[role] = [];
    acc[role].push(user);
    return acc;
  }, {});

  const sortedRoleKeys = Object.keys(groupedUsers).sort(
    (a, b) => (roleOrder[a] ?? 99) - (roleOrder[b] ?? 99)
  );

  const handleApprove = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "approved", role: "owner" })
        .eq("id", userId);

      if (error) throw error;

      toast.success("Usuário aprovado com sucesso!");
      fetchUsers();
    } catch (error: any) {
      console.error("Error approving user:", error);
      toast.error("Erro ao aprovar usuário");
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "rejected" })
        .eq("id", userId);

      if (error) throw error;

      toast.success("Usuário recusado");
      fetchUsers();
    } catch (error: any) {
      console.error("Error rejecting user:", error);
      toast.error("Erro ao recusar usuário");
    }
  };

  const confirmDelete = (user: UserProfile) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.id }
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Usuário deletado com sucesso!");
      fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Erro ao deletar usuário");
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  // Bulk selection handlers
  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.filter(u => u.role !== "admin").length) {
      setSelectedUsers(new Set());
    } else {
      const nonAdminIds = filteredUsers
        .filter(u => u.role !== "admin")
        .map(u => u.id);
      setSelectedUsers(new Set(nonAdminIds));
    }
  };

  const getSelectedUsers = () => {
    return filteredUsers.filter(u => selectedUsers.has(u.id));
  };

  const openBulkActionDialog = (action: BulkAction) => {
    setBulkAction(action);
    setBulkActionDialogOpen(true);
  };

  const executeBulkAction = async () => {
    if (!bulkAction || selectedUsers.size === 0) return;

    setBulkActionLoading(true);
    const selectedUserIds = Array.from(selectedUsers);
    let successCount = 0;
    let errorCount = 0;

    try {
      if (bulkAction === "approve") {
        // Only approve pending owners
        const usersToApprove = getSelectedUsers().filter(
          u => u.status === "pending" && u.role === "pending_owner"
        );
        
        for (const user of usersToApprove) {
          const { error } = await supabase
            .from("profiles")
            .update({ status: "approved", role: "owner" })
            .eq("id", user.id);
          
          if (error) {
            errorCount++;
            console.error(`Error approving user ${user.id}:`, error);
          } else {
            successCount++;
          }
        }
        
        if (successCount > 0) {
          toast.success(`${successCount} usuário(s) aprovado(s) com sucesso!`);
        }
        if (errorCount > 0) {
          toast.error(`Erro ao aprovar ${errorCount} usuário(s)`);
        }
        if (usersToApprove.length === 0) {
          toast.info("Nenhum usuário pendente selecionado para aprovar");
        }
      } else if (bulkAction === "reject") {
        // Reject selected users (except admins)
        const usersToReject = getSelectedUsers().filter(u => u.role !== "admin");
        
        for (const user of usersToReject) {
          const { error } = await supabase
            .from("profiles")
            .update({ status: "rejected" })
            .eq("id", user.id);
          
          if (error) {
            errorCount++;
            console.error(`Error rejecting user ${user.id}:`, error);
          } else {
            successCount++;
          }
        }
        
        if (successCount > 0) {
          toast.success(`${successCount} usuário(s) recusado(s)`);
        }
        if (errorCount > 0) {
          toast.error(`Erro ao recusar ${errorCount} usuário(s)`);
        }
      } else if (bulkAction === "delete") {
        // Delete selected users (except admins)
        const usersToDelete = getSelectedUsers().filter(u => u.role !== "admin");
        
        for (const user of usersToDelete) {
          try {
            const { data, error } = await supabase.functions.invoke('delete-user', {
              body: { userId: user.id }
            });
            
            if (error || data?.error) {
              errorCount++;
              console.error(`Error deleting user ${user.id}:`, error || data?.error);
            } else {
              successCount++;
            }
          } catch (err) {
            errorCount++;
            console.error(`Error deleting user ${user.id}:`, err);
          }
        }
        
        if (successCount > 0) {
          toast.success(`${successCount} usuário(s) deletado(s) com sucesso!`);
        }
        if (errorCount > 0) {
          toast.error(`Erro ao deletar ${errorCount} usuário(s)`);
        }
      }

      fetchUsers();
      setSelectedUsers(new Set());
    } catch (error: any) {
      console.error("Bulk action error:", error);
      toast.error("Erro ao executar ação em massa");
    } finally {
      setBulkActionLoading(false);
      setBulkActionDialogOpen(false);
      setBulkAction(null);
    }
  };

  const getBulkActionDescription = () => {
    const count = selectedUsers.size;
    switch (bulkAction) {
      case "approve":
        const pendingCount = getSelectedUsers().filter(
          u => u.status === "pending" && u.role === "pending_owner"
        ).length;
        return `Você vai aprovar ${pendingCount} usuário(s) pendente(s). Os demais selecionados serão ignorados.`;
      case "reject":
        return `Você vai recusar ${count} usuário(s) selecionado(s).`;
      case "delete":
        return `Você vai deletar ${count} usuário(s) selecionado(s). Esta ação não pode ser desfeita.`;
      default:
        return "";
    }
  };

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      admin: { label: "Admin", variant: "destructive" },
      agent: { label: "Atendente", variant: "default" },
      maintenance: { label: "Manutenção", variant: "secondary" },
      owner: { label: "Proprietário", variant: "outline" },
      pending_owner: { label: "Proprietário Pendente", variant: "outline" },
      cleaner: { label: "Faxineira", variant: "secondary" },
    };

    const config = roleMap[role] || { label: role, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      approved: { label: "Aprovado", variant: "default" },
      pending: { label: "Pendente", variant: "secondary" },
      rejected: { label: "Recusado", variant: "destructive" },
    };

    const config = statusMap[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (profile?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Acesso não autorizado</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Carregando usuários..." />;
  }

  const nonAdminFilteredUsers = filteredUsers.filter(u => u.role !== "admin");
  const allNonAdminsSelected = nonAdminFilteredUsers.length > 0 && 
    selectedUsers.size === nonAdminFilteredUsers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => goBack(navigate, "/painel")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Gerenciar Usuários</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Bulk Actions Bar */}
        {selectedUsers.size > 0 && (
          <Card className="mb-4 border-primary/50 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedUsers.size} usuário(s) selecionado(s)
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openBulkActionDialog("approve")}
                  className="gap-2"
                >
                  <UserCheck className="h-4 w-4" />
                  Aprovar Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openBulkActionDialog("reject")}
                  className="gap-2"
                >
                  <UserX className="h-4 w-4" />
                  Recusar Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openBulkActionDialog("delete")}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedUsers(new Set())}
                >
                  Limpar Seleção
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Funções</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Atendente</SelectItem>
                  <SelectItem value="maintenance">Manutenção</SelectItem>
                  <SelectItem value="owner">Proprietário</SelectItem>
                  <SelectItem value="pending_owner">Proprietário Pendente</SelectItem>
                  <SelectItem value="cleaner">Faxineira</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="rejected">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allNonAdminsSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedRoleKeys.map((role) => (
                      <>
                        <TableRow key={`header-${role}`} className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={8} className="py-2">
                            <span className="text-sm font-semibold text-muted-foreground">
                              {roleLabels[role] || role} ({groupedUsers[role].length})
                            </span>
                          </TableCell>
                        </TableRow>
                        {groupedUsers[role].map((user) => (
                          <TableRow 
                            key={user.id}
                            className={selectedUsers.has(user.id) ? "bg-primary/5" : ""}
                          >
                            <TableCell>
                              {user.role !== "admin" && (
                                <Checkbox
                                  checked={selectedUsers.has(user.id)}
                                  onCheckedChange={() => toggleUserSelection(user.id)}
                                  aria-label={`Selecionar ${user.name}`}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.phone || "-"}</TableCell>
                            <TableCell>{getRoleBadge(user.role)}</TableCell>
                            <TableCell>{getStatusBadge(user.status)}</TableCell>
                            <TableCell>
                              {new Date(user.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {user.status === "pending" && user.role === "pending_owner" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleApprove(user.id)}
                                      title="Aprovar"
                                    >
                                      <UserCheck className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReject(user.id)}
                                      title="Recusar"
                                    >
                                      <UserX className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                {(user.role === "owner" || user.role === "pending_owner") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(`/historico-comunicacao/${user.id}`)}
                                    title="Ver histórico de comunicação"
                                  >
                                    <History className="h-4 w-4" />
                                  </Button>
                                )}
                                {user.role !== "admin" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => confirmDelete(user)}
                                    title="Deletar"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Single Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o usuário <strong>{userToDelete?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Dialog */}
      <AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "approve" && "Aprovar usuários em massa"}
              {bulkAction === "reject" && "Recusar usuários em massa"}
              {bulkAction === "delete" && "Excluir usuários em massa"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {getBulkActionDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeBulkAction} 
              disabled={bulkActionLoading}
              className={bulkAction === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {bulkActionLoading ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
