import pool from "../db/pool.js";

export async function getDashboardStats(req, res) {
  try {
    const [patients, doctors, appointments, completed, specializations] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS count FROM users WHERE role = 'patient'`,
        ),
        pool.query(`SELECT COUNT(*)::int AS count FROM doctors`),
        pool.query(`SELECT COUNT(*)::int AS count FROM appointments`),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM appointments WHERE status = 'completed'`,
        ),
        pool.query(`
        SELECT specialization, COUNT(*)::int AS count
        FROM doctors GROUP BY specialization ORDER BY count DESC LIMIT 5
      `),
      ]);

    const totalAppointments = appointments.rows[0].count;
    const completedAppointments = completed.rows[0].count;
    const completionRate = totalAppointments
      ? Math.round((completedAppointments / totalAppointments) * 100)
      : 0;

    res.json({
      totalPatients: patients.rows[0].count,
      totalDoctors: doctors.rows[0].count,
      totalAppointments,
      completedAppointments,
      completionRate,
      popularSpecializations: specializations.rows,
    });
  } catch (err) {
    console.error("Admin stats error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
}

export async function getReminders(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, a.appointment_date, a.start_time
       FROM reminders r
       JOIN appointments a ON a.id = r.appointment_id
       WHERE r.user_id = $1
       ORDER BY r.scheduled_for DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (err) {
    console.error("Get reminders error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
}

export default { getDashboardStats, getReminders };
