import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import {
  eliminarUsuarioCtrl,
  eliminarUsuariosPruebaCtrl,
  login,
  logout,
  me,
  usuariosActualizarColor,
  usuariosCrear,
  usuariosListar,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", login);

router.get("/usuarios", autenticar, soloAdministradora, usuariosListar);
router.post("/usuarios", autenticar, soloAdministradora, usuariosCrear);
router.patch("/usuarios/:id", autenticar, soloAdministradora, usuariosActualizarColor);
router.delete("/usuarios/test", autenticar, soloAdministradora, eliminarUsuariosPruebaCtrl);
router.delete("/usuarios/:id", autenticar, soloAdministradora, eliminarUsuarioCtrl);

router.get("/me", autenticar, me);
router.post("/logout", autenticar, logout);

export default router;
