function initAnalogClock() {
    const container = document.getElementById('clock-canvas-container');
    if (!container) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    container.appendChild(canvas);

    canvas.width = 180;
    canvas.height = 180;

    function drawClock() {
        const now = new Date();
        const radius = canvas.width / 2;
        const drawRadius = radius - 15;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(radius, radius);

        // 绘制表盘背景
        ctx.beginPath();
        ctx.arc(0, 0, drawRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 5;
        ctx.stroke();

        // 绘制数字 1-12
        ctx.font = "bold 13px Arial";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = "#bbb";
        for (let num = 1; num <= 12; num++) {
            let ang = num * Math.PI / 6;
            ctx.rotate(ang);
            ctx.translate(0, -drawRadius + 22);
            ctx.rotate(-ang);
            ctx.fillText(num.toString(), 0, 0);
            ctx.rotate(ang);
            ctx.translate(0, drawRadius - 22);
            ctx.rotate(-ang);
        }

        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        // 时针
        drawHand(ctx, (h % 12 + m / 60) * 30, drawRadius * 0.45, 4, '#2d3436');
        // 分针
        drawHand(ctx, (m + s / 60) * 6, drawRadius * 0.65, 3, '#636e72');
        // 秒针
        drawHand(ctx, s * 6, drawRadius * 0.8, 1.5, '#0984e3');

        // 中心轴
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#2d3436';
        ctx.fill();

        ctx.restore();

        // 底部日期更新
        const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        document.getElementById('date-display').innerText = dateStr;
        document.getElementById('day-display').innerText = days[now.getDay()];

        requestAnimationFrame(drawClock);
    }

    function drawHand(ctx, deg, len, wid, col) {
        ctx.save();
        ctx.rotate(deg * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -len);
        ctx.strokeStyle = col;
        ctx.lineWidth = wid;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }
    drawClock();
}