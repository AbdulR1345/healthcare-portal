import { Router } from "express";

import {
  bookAppointment,
  getMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
} from "../controllers/appointmentController.js";

import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

/*
 * Every authenticated user can access this endpoint,
 * but the controller scopes the returned appointments
 * according to the user's role.
 */
router.get("/", getMyAppointments);

/*
 * Only patients can create appointments.
 */
router.post("/", authorize("patient"), bookAppointment);

/*
 * Status changes are additionally checked inside
 * the controller using ownership + state transitions.
 */
router.patch(
  "/:id/status",
  authorize("patient", "doctor", "admin"),
  updateAppointmentStatus,
);

/*
 * Only the patient who owns the appointment or an admin
 * can reschedule it.
 */
router.patch(
  "/:id/reschedule",
  authorize("patient", "admin"),
  rescheduleAppointment,
);

export default router;
