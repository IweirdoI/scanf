/// Clamp the requested task count before starting work.
fn clamp_count(count: i32, minimum: i32) -> i32 {
    if count < minimum { return minimum; }
    count
}

fn main() {
    clamp_count(3, 1);
}
