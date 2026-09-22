// payment 支付模块
// money.go 金额处理：全程字符串十进制，只在进渠道时换算成分，避免浮点误差进入账务判断
package payment

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// money 把浮点数格式化为两位小数字符串
func money(v float64) string {
	if v < 0 {
		v = 0
	}
	return strconv.FormatFloat(round2(v), 'f', 2, 64)
}

// round2 四舍五入到分
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// priceValue 解析金额字符串，容忍前端传来的 "$4.99 / kg" 这类文案
func priceValue(s string) float64 {
	re := regexp.MustCompile(`-?\d+(\.\d+)?`)
	got := re.FindString(s)
	if got == "" {
		return 0
	}
	v, err := strconv.ParseFloat(got, 64)
	if err != nil {
		return 0
	}
	return v
}

// normalizePrice 把任意输入金额文案规范成两位小数字符串，金额比对前先过这里
func normalizePrice(s string) string { return money(priceValue(s)) }

// amountFen 字符串十进制转渠道侧整数分，全程不做浮点乘除
func amountFen(amount string) (int64, error) {
	parts := strings.Split(normalizePrice(amount), ".")
	yuan, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("订单金额异常，无法发起支付")
	}
	var cents int64
	if len(parts) > 1 && parts[1] != "" {
		frac := parts[1]
		for len(frac) < 2 {
			frac += "0"
		}
		cents, err = strconv.ParseInt(frac[:2], 10, 64)
		if err != nil {
			return 0, fmt.Errorf("订单金额异常，无法发起支付")
		}
	}
	fen := yuan*100 + cents
	if fen <= 0 {
		return 0, fmt.Errorf("订单金额异常，无法发起支付")
	}
	return fen, nil
}

// fenToAmount 分回落到字符串十进制，用于与本地金额快照严格比对
func fenToAmount(fen int64) string {
	return fmt.Sprintf("%d.%02d", fen/100, fen%100)
}

// firstNonEmpty 返回第一个非空字符串
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
