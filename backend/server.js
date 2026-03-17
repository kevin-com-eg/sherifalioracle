const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');

// 🌟 السطر السحري اللي بيحل مشكلة [object Object] نهائياً 🌟
oracledb.fetchAsString = [ oracledb.CLOB ];

const app = express();
app.use(cors());
app.use(express.json());

// ⚙️ إعدادات الاتصال بأوراكل (تأكد من الباسورد بتاعتك)
const dbConfig = {
    user: "system",
    password: "123456789", 
    connectString: "localhost:1521/XEPDB1"
};

// 1. إنشاء حساب جديد
app.post('/api/auth/signup', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const { name, email, password, grade, phone, parentphone, deviceId } = req.body;

        const check = await connection.execute(`SELECT email FROM users WHERE email = :email`, [email]);
        if (check.rows.length > 0) return res.json({ success: false, message: "هذا البريد مسجل مسبقاً!" });

        const studentId = Math.floor(100000 + Math.random() * 900000).toString();
        const devicesJson = JSON.stringify([deviceId]);

        await connection.execute(
            `INSERT INTO users (name, email, password, grade, phone, parentphone, studentid, role, devices) 
             VALUES (:name, :email, :password, :grade, :phone, :parentphone, :studentid, 'student', :devices)`,
            { name, email, password, grade, phone, parentphone, studentid: studentId, devices: devicesJson },
            { autoCommit: true }
        );

        res.json({ success: true, user: { name, email, role: 'student', studentid: studentId } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 2. تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        const { email, password, deviceId } = req.body;

        const result = await connection.execute(
            `SELECT * FROM users WHERE email = :email AND password = :password`,
            [email, password],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // هنا كانت بتحصل المشكلة والحمدلله اتحلت بالسطر اللي فوق
            let userDevices = JSON.parse(user.DEVICES || '[]');

            if (!userDevices.includes(deviceId)) {
                if (userDevices.length >= 2) {
                    return res.json({ success: false, message: "تم الوصول للحد الأقصى للأجهزة (جهازين)." });
                } else {
                    userDevices.push(deviceId);
                    await connection.execute(
                        `UPDATE users SET devices = :devices WHERE email = :email`,
                        { devices: JSON.stringify(userDevices), email: email },
                        { autoCommit: true }
                    );
                }
            }
            res.json({ success: true, user: { name: user.NAME, email: user.EMAIL, role: user.ROLE, studentid: user.STUDENTID } });
        } else {
            res.json({ success: false, message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 3. جلب بيانات الحصة
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

// 4. التحقق من تفعيل الكود
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

// 5. تفعيل الكود
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

// 6. حفظ نتيجة الامتحان
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

app.listen(3000, () => console.log('🚀 السيرفر شغال وجاهز لاستقبال الطلاب على البورت 3000!'));
