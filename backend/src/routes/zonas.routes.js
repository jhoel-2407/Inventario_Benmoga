import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import {
  actividad,
  actualizar,
  crear,
  crearLote,
  eliminar,
  finalizar,
  listar,
  seleccionar,
} from "../controllers/zonas.controller.js";

const router = Router();
router.use(autenticar);

router.get("/", listar);
router.get("/actividad", soloAdministradora, actividad);
router.post("/", soloAdministradora, crear);
router.post("/lote", soloAdministradora, crearLote);
router.put("/:id", soloAdministradora, actualizar);
router.delete("/:id", soloAdministradora, eliminar);
router.post("/seleccionar", seleccionar);
router.post("/finalizar", finalizar);

export default router;
