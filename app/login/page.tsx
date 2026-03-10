import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-secondary">Bem-vindo ao QRápido</p>
          <h1 className="text-3xl font-semibold tracking-tight">Acesse o painel da sua operação</h1>
          <p className="text-sm text-muted-foreground">Entre para acompanhar pedidos em tempo real e otimizar o salão.</p>
        </div>

        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <Input id="email" type="email" placeholder="contato@restaurante.com" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
          <Button className="w-full" type="submit">
            Entrar no dashboard
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </form>
      </Card>
    </main>
  );
}
