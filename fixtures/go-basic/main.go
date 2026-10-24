package main

import "strings"

// Shape is implemented by Circle.
type Shape interface {
	Area(scale int) int
}

type Circle struct{ r int }

func (c Circle) Area(scale int) int { return c.r * scale }

func double(x int) int { return x * 2 }

func apply(f func(int) int, v int) int {
	return f(v)
}

func total(s Shape, n int) int {
	d := double(n)
	return apply(double, s.Area(d))
}

func main() {
	name := strings.ToUpper("x")
	_ = name
	_ = total(Circle{r: 1}, 3)
}
