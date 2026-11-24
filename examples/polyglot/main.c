// Clamp a requested count to the minimum; this example is independent.
int clamp_count(int count, int minimum) {
    if (count < minimum) return minimum;
    return count;
}

int main(void) {
    return clamp_count(3, 1);
}
