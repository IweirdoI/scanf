package main

// clampCount keeps the requested task count above a minimum.
func clampCount(count, minimum int) int {
    if count < minimum { return minimum }
    return count
}

func main() {
    clampCount(3, 1)
}
