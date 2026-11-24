class Main {
    /** Return a count no smaller than minimum.
     * @param count number of tasks requested
     * @param minimum smallest allowed count
     */
    static int clampCount(int count, int minimum) {
        if (count < minimum) return minimum;
        return count;
    }

    public static void main(String[] args) {
        clampCount(3, 1);
    }
}
