import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/auth";
import { LoginForm } from "./LoginForm";

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (auth.data) {
      void navigate({ to: "/" });
    }
  }, [auth.data, navigate]);

  return <LoginForm />;
}
