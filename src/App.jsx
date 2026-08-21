import FinancialPlan from "./FinancialPlan";
import { AuthGate } from "./Auth";

function App() {
  return (
    <AuthGate>
      <FinancialPlan />
    </AuthGate>
  );
}

export default App;
