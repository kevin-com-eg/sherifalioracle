const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

const app = express();
app.use(cors()); // عشان يسمح للموقع يكلم السيرفر
app.use(express.json());

// ⚙️ إعدادات الاتصال بقاعدة بيانات أوراكل
const dbConfig = {
    user: "system",
    password: "123456789", // ⚠️ لو عملت باسورد مختلفة وقت تسطيب أوراكل، اكتبها هنا
    connectString: "localhost:1521/XEPDB1"
};

// 1. جلب بيانات الحصة
app.get('/api/lessons/:id', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT * FROM lessons WHERE id = :id`,
            [req.params.id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows[0] || {});
    } catch (err) { res.status(500).json({ error: err.message }); } 
    finally { if (connection) await connection.close(); }
});

// 2. التحقق من تفعيل الكود
app.get('/api/check-access', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT activated_at FROM lesson_codes WHERE used_by = :email AND lesson_id = :lessonId`,
            { email: req.query.email, lessonId: req.query.lesson },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length > 0) res.json({ hasAccess: true, activatedAt: result.rows[0].ACTIVATED_AT });
        else res.json({ hasAccess: false });
    } catch (err) { res.status(500).json({ error: err.message }); } 
    finally { if (connection) await connection.close(); }
});

// 3. تفعيل الكود وربطه بالطالب
app.post('/api/activate-code', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const { code, email, lessonId } = req.body;

        const check = await connection.execute(`SELECT * FROM lesson_codes WHERE code = :code AND used = 0`, [code], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (check.rows.length > 0) {
            await connection.execute(
                `UPDATE lesson_codes SET used = 1, used_by = :email, lesson_id = :lessonId, activated_at = CURRENT_TIMESTAMP WHERE code = :code`,
                { email: email, lessonId: lessonId, code: code },
                { autoCommit: true }
            );
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "الكود غير صحيح أو مستخدم مسبقاً" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); } 
    finally { if (connection) await connection.close(); }
});

// 4. حفظ نتيجة الامتحان
app.post('/api/save-result', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const { email, lessonId, score, answers } = req.body;

        await connection.execute(
            `INSERT INTO student_results (student_email, lesson_id, score, user_answers) VALUES (:email, :lessonId, :score, :answers)`,
            { email: email, lessonId: lessonId, score: score, answers: JSON.stringify(answers) },
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); } 
    finally { if (connection) await connection.close(); }
});

// 5. التحقق هل امتحن مسبقاً؟
app.get('/api/results', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT * FROM student_results WHERE student_email = :email AND lesson_id = :lessonId`,
            { email: req.query.email, lessonId: req.query.lesson },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length > 0) res.json({ completed: true, score: result.rows[0].SCORE, answers: JSON.parse(result.rows[0].USER_ANSWERS || '{}') });
        else res.json({ completed: false });
    } catch (err) { res.status(500).json({ error: err.message }); } 
    finally { if (connection) await connection.close(); }
});

// تشغيل السيرفر
app.listen(3000, () => console.log('🚀 السيرفر شغال وجاهز على البورت 3000!'));