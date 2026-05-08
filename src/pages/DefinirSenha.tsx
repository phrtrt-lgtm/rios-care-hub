import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Lock, ArrowRight, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DefinirSenha() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Magic link costuma chegar como hash (#access_token=...) — supabase-js detecta sozinho.
    // Damos um pequeno tempo pra sessão ser estabelecida.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("Link expirado ou inválido. Solicite um novo acesso.");
        navigate("/login", { replace: true });
        return;
      }
      setEmail(data.session.user.email || "");
      setChecking(false);
    }, 600);
    return () => clearTimeout(t);
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha precisa ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/bem-vindo", { replace: true }), 1400);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-secondary text-secondary-foreground">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-primary/30 blur-[140px]" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-primary/20 blur-[140px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-16">
        {/* Lado esquerdo — hot site */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3 w-3" />
            Curadoria gratuita liberada
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Sua curadoria <span className="text-primary">RIOS</span> está pronta.
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/70 md:text-lg">
            Um plano de performance feito sob medida pro seu imóvel — lista de
            compras curada, observações da nossa equipe e tudo o que precisa pra
            transformar seu anúncio em destaque.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Curadoria editorial", d: "Itens escolhidos pela nossa estilista" },
              { t: "Compras pela RIOS", d: "Você só transfere o valor — cuidamos do resto" },
              { t: "Instalação inclusa", d: "Frete, montagem e ajustes por nossa conta" },
            ].map((b) => (
              <div key={b.t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Check className="h-3 w-3" />
                  {b.t}
                </div>
                <p className="text-xs leading-relaxed text-white/60">{b.d}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-white/50">
            Crie sua senha pra acessar o portal RIOS sempre que quiser — você
            verá sua curadoria, suas cobranças, manutenções e tudo do seu imóvel
            num só lugar.
          </p>
        </motion.div>

        {/* Lado direito — formulário */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative"
        >
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-md shadow-2xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-primary/20 p-2.5 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Crie sua senha</h2>
                <p className="text-xs text-white/60">Acesso permanente ao portal RIOS</p>
              </div>
            </div>

            {checking ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validando seu acesso…
              </div>
            ) : done ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-primary/20 p-3 text-primary">
                  <Check className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-white">Tudo certo!</p>
                <p className="text-xs text-white/60">Levando você para sua curadoria…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    E-mail
                  </label>
                  <Input
                    value={email}
                    disabled
                    className="border-white/10 bg-white/5 text-white/80"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="mínimo 6 caracteres"
                      autoFocus
                      className="border-white/15 bg-white/[0.06] pr-10 text-white placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 hover:text-white"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/60">
                    Confirmar senha
                  </label>
                  <Input
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="repita a senha"
                    className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/30"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  size="lg"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Salvar senha e ver minha curadoria
                </Button>

                <p className="text-center text-[11px] text-white/40">
                  Você pode alterar essa senha depois em "Conta".
                </p>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
