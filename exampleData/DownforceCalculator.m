% -------------------------------
%  Downforce Calc
% -------------------------------

% Load data
data = readtable('Book1.csv');

% Extract relevant columns
mph = data.MPH;
rpm = data.RPM;
FL = data.SusPotFL;
FR = data.SusPotFR;
RL = data.SusPotRL;
RR = data.SusPotRR;

% Zeroed suspension lengths (mm)
FL0 = 69;
FR0 = 89;
RL0 = 73;
RR0 = 60;

% Motion ratios and spring rates (in N/mm)
MR_Front = 0.95;
MR_Rear = 0.92;
kF = 39.99;
kR = 30.00;

% Speed analysis targets
target_speeds = [35, 55, 75];
speed_tol = 7.5;        % mph
mph_grad_tol = 7.5;   % ΔMPH threshold
rpm_grad_tol = 1250;   % ΔRPM threshold
min_points = 100;      % minimum samples in steady block

% Loop through each speed
for i = 1:length(target_speeds)
    target = target_speeds(i);

    % Compute gradients
    mph_grad = [0; abs(diff(mph))];
    rpm_grad = [0; abs(diff(rpm))];

    % Apply all filters
    steady_idx = find( ...
        abs(mph - target) < speed_tol & ...
        mph_grad < mph_grad_tol & ...
        rpm_grad < rpm_grad_tol);

    if isempty(steady_idx)
        fprintf('No steady-state data near %d mph\n', target);
        continue;
    end

    % Group consecutive steady states
    group_start = steady_idx([true; diff(steady_idx) > 1]);
    group_end   = steady_idx([diff(steady_idx) > 1; true]);
    block_lengths = group_end - group_start + 1;

    % Filter for blocks with enough points
    valid_blocks = find(block_lengths >= min_points);

    if isempty(valid_blocks)
        fprintf('No valid steady-state block (≥%d points) at %d mph\n', min_points, target);
        continue;
    end

    % Use longest valid block
    [~, longest_idx] = max(block_lengths(valid_blocks));
    idx_start = group_start(valid_blocks(longest_idx));
    idx_end   = group_end(valid_blocks(longest_idx));
    idx_range = idx_start:idx_end;

    % Average suspension pot values
    avg_FL = mean(FL(idx_range));
    avg_FR = mean(FR(idx_range));
    avg_RL = mean(RL(idx_range));
    avg_RR = mean(RR(idx_range));

    % Displacement from zero position
    dFL = (avg_FL - FL0)/10;
    dFR = (avg_FR - FR0)/10;
    dRL = (avg_RL - RL0)/10;
    dRR = (avg_RR - RR0)/10;

    % Convert to wheel displacements (mm)
    wFL = dFL / MR_Front;
    wFR = dFR / MR_Front;
    wRL = dRL / MR_Rear;
    wRR = dRR / MR_Rear;

    % Calculate downforces (N)
    fFL = wFL * kF;
    fFR = wFR * kF;
    fRL = wRL * kR;
    fRR = wRR * kR;

    % Totals
    totalDF = fFL + fFR + fRL + fRR;
    frontDF = fFL + fFR;
    rearDF = fRL + fRR;
    front_ratio = frontDF / totalDF;

    % Output results
    fprintf('\n--- Results at %d mph (Block: %d–%d, %d pts) ---\n', ...
        target, idx_start, idx_end, length(idx_range));
    fprintf('Avg SusPot (mm): FL = %.2f, FR = %.2f, RL = %.2f, RR = %.2f\n', ...
        avg_FL, avg_FR, avg_RL, avg_RR);
    fprintf('Displacement from zero (mm): FL = %.2f, FR = %.2f, RL = %.2f, RR = %.2f\n', ...
        dFL, dFR, dRL, dRR);
    fprintf('Downforces (N): FL = %.2f, FR = %.2f, RL = %.2f, RR = %.2f\n', ...
        fFL, fFR, fRL, fRR);
    fprintf('Total Downforce: %.2f N\n', totalDF);
    fprintf('Front:Rear Distribution: %.2f%% Front\n', front_ratio * 100);
end




% -------------------------------
%  Plotting Results
% -------------------------------

% Plotting
figure('Name','Downforce Analysis','NumberTitle','off','Position',[100 100 1200 800]);

% 1. Potentiometer Displacement
subplot(2,2,1);
hold on; grid on; box on;
plot(recorded_speeds, disp_FL, '-o', 'DisplayName','FL');
plot(recorded_speeds, disp_FR, '-o', 'DisplayName','FR');
plot(recorded_speeds, disp_RL, '-s', 'DisplayName','RL');
plot(recorded_speeds, disp_RR, '-s', 'DisplayName','RR');
xlabel('Speed (mph)');
ylabel('Displacement (mm)');
title('Suspension Displacement');
legend('Location','best');
set(gca, 'FontSize', 12);
ylims = ylim;
ylim([ylims(1) - 0.1*(ylims(2)-ylims(1)), ylims(2) + 0.1*(ylims(2)-ylims(1))]);

% 2. Downforce per Corner
subplot(2,2,2);
hold on; grid on; box on;
plot(recorded_speeds, df_FL, '-o', 'DisplayName','FL');
plot(recorded_speeds, df_FR, '-o', 'DisplayName','FR');
plot(recorded_speeds, df_RL, '-s', 'DisplayName','RL');
plot(recorded_speeds, df_RR, '-s', 'DisplayName','RR');
xlabel('Speed (mph)');
ylabel('Downforce (N)');
title('Downforce by Corner');
legend('Location','best');
set(gca, 'FontSize', 12);
ylims = ylim;
ylim([ylims(1) - 0.1*(ylims(2)-ylims(1)), ylims(2) + 0.1*(ylims(2)-ylims(1))]);

% 3. Total Downforce
subplot(2,2,3);
plot(recorded_speeds, total_DF, '-d','Color',[0 0.5 0.8],'LineWidth',2);
grid on; box on;
xlabel('Speed (mph)');
ylabel('Total Downforce (N)');
title('Total Downforce vs Speed');
set(gca, 'FontSize', 12);
ylims = ylim;
ylim([ylims(1) - 0.1*(ylims(2)-ylims(1)), ylims(2) + 0.1*(ylims(2)-ylims(1))]);

% 4. Front Downforce Percentage
subplot(2,2,4);
plot(recorded_speeds, front_ratio_pct, '-^','Color',[0.8 0.2 0.2],'LineWidth',2);
grid on; box on;
xlabel('Speed (mph)');
ylabel('Front Downforce (%)');
title('Front:Rear Balance');
set(gca, 'FontSize', 12);
ylims = ylim;
ylim([ylims(1) - 0.1*(ylims(2)-ylims(1)), ylims(2) + 0.1*(ylims(2)-ylims(1))]);

sgtitle('Aerodynamic Downforce Analysis','FontSize',16,'FontWeight','bold');


% -------------------------------
%  FSAE Downforce Visualization
% -------------------------------
figure('Name','FSAE Downforce Distribution','NumberTitle','off','Color','w');
axis equal;
hold on;
grid off;
axis off;
title('FSAE Car Downforce Distribution','FontSize',16,'FontWeight','bold');

% Car body outline
carLength = 2.0;  % meters
carWidth = 1.2;
rectangle('Position',[-carLength/2, -carWidth/2, carLength, carWidth], ...
    'EdgeColor','k','LineWidth',2,'Curvature',0.1);

% Front & Rear wing positions
frontWingX = -0.8;
rearWingX = 0.8;
wingWidth = 0.9;

% Use the last available data point
fDF = frontDF;  % Front downforce (fFL + fFR)
rDF = rearDF;   % Rear downforce (fRL + fRR)
totalDF_scalar = totalDF(end);
balance_ratio = front_ratio * 100;  % percent front

% Scale factor for arrows
arrowScale = 0.002;

% Draw front downforce arrow
quiver(frontWingX, 0, 0, -fDF*arrowScale, 0, ...
    'MaxHeadSize',5,'Color','b','LineWidth',3);
text(frontWingX - 0.1, -fDF*arrowScale - 0.05, ...
    sprintf('Front DF: %.0f N', fDF), 'FontSize',12,'Color','b');

% Draw rear downforce arrow
quiver(rearWingX, 0, 0, -rDF*arrowScale, 0, ...
    'MaxHeadSize',5,'Color','r','LineWidth',3);
text(rearWingX - 0.1, -rDF*arrowScale - 0.05, ...
    sprintf('Rear DF: %.0f N', rDF), 'FontSize',12,'Color','r');

% Center of pressure arrow (shows distribution)
cpX = 0;
cpY = 0.7;
cpLength = (balance_ratio - 50) * 0.01;  % Scale around center
quiver(cpX, cpY, cpLength, 0, 0, 'LineWidth',3, ...
    'MaxHeadSize',3,'Color','k');
text(cpX + cpLength + 0.05, cpY + 0.05, ...
    sprintf('%.1f%% Front Bias', balance_ratio), 'FontSize',12);

% Label front/rear
text(frontWingX, 0.6, 'Front Wing','FontSize',12,'HorizontalAlignment','center');
text(rearWingX, 0.6, 'Rear Wing','FontSize',12,'HorizontalAlignment','center');

% Draw tires (optional)
tireW = 0.2; tireL = 0.05;
rectangle('Position',[-carLength/2+0.2, -carWidth/2-0.1, tireL, tireW], 'FaceColor','k');
rectangle('Position',[-carLength/2+0.2, carWidth/2-0.1, tireL, tireW], 'FaceColor','k');
rectangle('Position',[carLength/2-0.25, -carWidth/2-0.1, tireL, tireW], 'FaceColor','k');
rectangle('Position',[carLength/2-0.25, carWidth/2-0.1, tireL, tireW], 'FaceColor','k');
