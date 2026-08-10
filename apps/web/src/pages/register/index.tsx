import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/auth";
import { RegisterForm } from "./RegisterForm";

export function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (auth.data) {
      void navigate({ to: "/" });
    }
  }, [auth.data, navigate]);

  return <RegisterForm />;
}
