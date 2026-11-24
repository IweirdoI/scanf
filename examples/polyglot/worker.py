"""Python worker. This sample is independent of the other language examples."""


def normalize_count(count: int, minimum: int = 1):
    """Return a count that is at least minimum.

    :param count: Number of tasks requested by the caller.
    :param minimum: Smallest allowed number of tasks.
    """
    if count < minimum:
        return minimum
    return count


def run_worker(count: int):
    """Normalize the requested task count before starting work."""
    return normalize_count(count)


if __name__ == "__main__":
    run_worker(3)
