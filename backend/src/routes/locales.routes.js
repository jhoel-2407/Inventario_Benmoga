import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import { actualizar, crear, listar } from "../controllers/locales.controller.js";

const router = Router();
router.use(autenticar);

router.get("/", listar);
router.post("/", soloAdministradora, crear);
router.patch("/:id", soloAdministradora, actualizar);

export default router;
