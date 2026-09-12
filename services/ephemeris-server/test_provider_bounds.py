"""Deterministic offline resource and privacy boundary tests; no provider I/O."""
from __future__ import annotations

import io
import threading
import unittest
from unittest import mock
from test_server import server


class ProviderBoundsTests(unittest.TestCase):
    def test_completed_transport_timeout_is_not_mistaken_for_pending_future(self):
        def work(*args):raise TimeoutError("bounded transport failure")
        manager=server.ProviderWork(work,deadline_seconds=0.03)
        try:
            with self.assertRaises(TimeoutError):manager.subscribe((0.,0.,0.,0.)).result()
        finally:manager.close()

    def test_four_active_eight_queued_and_exact_coalescing(self):
        gate=threading.Event()
        started=threading.Barrier(5)
        lock=threading.Lock()
        calls=[]
        def work(*args):
            with lock:
                calls.append(args)
                first=len(calls)<=4
            if first: started.wait(2)
            gate.wait(2)
            return {"identity":args}
        manager=server.ProviderWork(work)
        try:
            tickets=[manager.subscribe((float(i),0.,0.,0.)) for i in range(4)]
            started.wait(2)
            tickets += [manager.subscribe((float(i),0.,0.,0.)) for i in range(4,12)]
            with self.assertRaises(server.ProviderError) as caught:manager.subscribe((12.,0.,0.,0.))
            self.assertEqual(caught.exception.code,"overload")
            duplicate=manager.subscribe((0.,0.,0.,0.))
            tickets[0].cancel()
            self.assertEqual(len(calls),4)
            gate.set()
            self.assertEqual(duplicate.result()["identity"],(0.,0.,0.,0.))
            for ticket in tickets[1:]:ticket.result()
            self.assertEqual(len(calls),12)
        finally:gate.set();manager.close()

    def test_subscriber_deadline_and_cancel_are_independent(self):
        gate=threading.Event()
        manager=server.ProviderWork(lambda *args:gate.wait(2),deadline_seconds=0.03)
        try:
            a=manager.subscribe((0.,0.,0.,0.));b=manager.subscribe((0.,0.,0.,0.))
            a.cancel()
            with self.assertRaises(server.ProviderError) as cancelled:a.result()
            self.assertEqual(cancelled.exception.code,"cancelled")
            with self.assertRaises(server.ProviderError) as deadline:b.result()
            self.assertEqual(deadline.exception.code,"deadline")
        finally:gate.set();manager.close()

    def test_invalid_requests_do_not_enqueue_and_subscriber_results_do_not_alias(self):
        manager=server.ProviderWork(lambda *args:{"bodies":[]})
        try:
            with self.assertRaises(ValueError):manager.subscribe((0.,91.,0.,0.))
            a=manager.subscribe((0.,0.,0.,0.));result=a.result();result["bodies"].append("changed")
            self.assertEqual(manager.subscribe((0.,0.,0.,0.)).result(),{"bodies":[]})
        finally:manager.close()

    def test_upstream_byte_cap_and_per_call_timeout(self):
        response=mock.MagicMock()
        response.__enter__.return_value=io.BytesIO(b"x"*(server.MAX_RESPONSE_BYTES+1))
        with mock.patch.object(server.urllib.request,"urlopen",return_value=response) as call:
            with self.assertRaises(server.ProviderError) as caught:server._request_text({})
            self.assertEqual(caught.exception.code,"response_too_large")
            self.assertLessEqual(call.call_args.kwargs["timeout"],server.PER_CALL_SECONDS)

    def test_streaming_response_cannot_extend_each_call_deadline(self):
        clock=[0.0]
        class SlowStream:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read1(self,size):clock[0]+=3;return b"x"
        with mock.patch.object(server.time,"monotonic",side_effect=lambda:clock[0]), mock.patch.object(server.time,"sleep"), mock.patch.object(server.urllib.request,"urlopen",side_effect=lambda *args,**kwargs:SlowStream()) as call:
            with self.assertRaises(TimeoutError):server._request_text({})
            self.assertEqual(call.call_count,2)
            self.assertLess(clock[0],20)

    def test_handler_errors_never_echo_raw_coordinates_or_upstream_url(self):
        handler=object.__new__(server.Handler);sent=[]
        handler._send=lambda code,payload:sent.append((code,payload))
        handler.path="/v3/sky?unix=100&lat=1.23456789&lon=2&elev=3"
        with mock.patch.object(server,"snapshot_cached",side_effect=RuntimeError("https://provider/?SITE_COORD=1.23456789&secret=raw")):
            handler.do_GET()
        self.assertEqual(sent[-1][0],502)
        self.assertNotIn("1.23456789",str(sent))
        self.assertNotIn("https://",str(sent))
        self.assertEqual(sent[-1][1]["code"],"upstream_failed")

    def test_http_admission_has_finite_connection_capacity(self):
        listener=object.__new__(server.BoundedHTTPServer)
        listener.slots=threading.BoundedSemaphore(1)
        listener.slots.acquire()
        listener.shutdown_request=mock.Mock()
        connection=mock.Mock()
        listener.process_request(connection,("local-test",0))
        self.assertIn(b'"code":"overload"',connection.sendall.call_args.args[0])
        listener.shutdown_request.assert_called_once_with(connection)


if __name__=="__main__":unittest.main()
